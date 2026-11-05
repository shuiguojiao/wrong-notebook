import { resolve } from 'node:path';
import { expect } from '@playwright/test';
import { test } from './support/fixtures';

const photo = resolve('src/__tests__/fixtures/images/math_test.png');

test.describe('手机快速拍照录入', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('相册一次选择三张，每张创建独立的待校对后台任务', async ({ page, scenario }) => {
        await scenario.db.user.update({ where: { id: scenario.user.id }, data: { confirmBeforeImport: true } });
        await scenario.control({ hold: true });
        await scenario.login(page);
        await page.goto(`/?notebook=${scenario.book.id}`);
        const album = page.getByTestId('album-input');
        await expect(album).toHaveAttribute('multiple', '');
        await album.setInputFiles([photo, photo, photo]);
        await expect(page.getByTestId('album-submitted')).toHaveText('已提交 3 张，在后台识别中');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        const tasks = await scenario.db.importTask.findMany({ where: { userId: scenario.user.id } });
        expect(tasks).toHaveLength(3);
        expect(tasks.every(task => task.mode === 'review' && task.subjectId === scenario.book.id)).toBe(true);
        expect(new Set(tasks.map(task => task.clientRequestId)).size).toBe(3);
        await expect(page.getByTestId('import-tasks-entry')).toContainText('识别中 3');
        await scenario.control({ hold: false });
    });

    test('提交照片后可在识别完成前直接打开相机继续拍摄', async ({ page, scenario }) => {
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: async () => [{ kind: 'videoinput' }] } });
        });
        await scenario.control({ hold: true });
        await scenario.login(page);
        await page.goto('/');
        await page.getByTestId('camera-input').setInputFiles(photo);
        await page.getByRole('button', { name: '确认', exact: true }).click();
        const button = page.getByRole('button', { name: '继续拍下一张', exact: true });
        await expect(button).toBeEnabled();
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button.click()]);
        expect(await chooser.element().getAttribute('capture')).toBe('environment');
        await chooser.setFiles(photo);
        await expect(page.getByRole('heading', { name: /裁剪/ })).toBeVisible();
        expect(await scenario.db.importTask.count({ where: { userId: scenario.user.id } })).toBe(1);
        await scenario.control({ hold: false });
    });
    test('上传响应丢失后保留照片，刷新页面自动重传同一幂等键，只生成一个后台任务', async ({ page, scenario }) => {
        await scenario.control({ hold: true });
        await scenario.login(page);
        await page.goto('/');
        const ids: string[] = [];
        let failed = false;
        await page.route('**/api/import-tasks', async route => {
            if (route.request().method() !== 'POST') { await route.continue(); return; }
            ids.push(route.request().postDataJSON().clientRequestId);
            if (!failed) {
                failed = true;
                await route.fetch();
                await route.abort('failed');
            } else await route.continue();
        });
        await page.getByTestId('album-input').setInputFiles(photo);
        await page.getByRole('button', { name: '确认', exact: true }).click();
        await expect(page.getByTestId('pending-uploads')).toContainText('1 张待上传');
        await expect(page.getByTestId('pending-upload')).toHaveAttribute('data-attempts', '1');
        await page.reload();
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await expect.poll(() => ids.length, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
        await expect(page.getByTestId('pending-uploads')).toHaveCount(0, { timeout: 20000 });
        await expect(page.getByTestId('import-tasks-entry')).toContainText('识别中 1');
        expect(ids.length).toBeGreaterThanOrEqual(2);
        expect(new Set(ids).size).toBe(1);
        expect(await scenario.db.importTask.count({ where: { userId: scenario.user.id } })).toBe(1);
        await scenario.control({ hold: false });
    });

    test('相册超出二十张时提示并拒绝整批提交', async ({ page, scenario }) => {
        await scenario.login(page);
        await page.goto('/');
        await page.getByTestId('album-input').setInputFiles(Array.from({ length: 21 }, () => photo));
        await expect(page.getByText('一次最多选择 20 张照片，请分批选择。', { exact: true })).toBeVisible();
        expect(await scenario.db.importTask.count({ where: { userId: scenario.user.id } })).toBe(0);
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('业务错误保留照片并显示原因，可删除本机待上传照片', async ({ page, scenario }) => {
        await scenario.login(page);
        await page.goto('/');
        let requests = 0;
        await page.route('**/api/import-tasks', async route => {
            if (route.request().method() !== 'POST') { await route.continue(); return; }
            requests++;
            await route.fulfill({ status: 415, contentType: 'application/json', body: JSON.stringify({ message: 'UNSUPPORTED_IMAGE' }) });
        });
        await page.getByTestId('album-input').setInputFiles(photo);
        await page.getByRole('button', { name: '确认', exact: true }).click();
        const queue = page.getByTestId('pending-uploads');
        await expect(queue).toContainText('图片格式不支持');
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await expect(queue).toContainText('1 张待上传');
        expect(requests).toBe(1);
        await queue.getByRole('button', { name: '删除', exact: true }).click();
        await expect(queue).toHaveCount(0);
    });

});
