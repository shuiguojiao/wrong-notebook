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
});
