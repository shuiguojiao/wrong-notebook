import { expect, test } from './support/fixtures';
import { expectNoHorizontalOverflow } from './support/batch-flows';
import { makeTextPdf } from './support/e4-helpers';

for (const ui of ['notebook', 'simple']) {
    for (const device of [
        { name: 'iPad 横屏', width: 1180, height: 820, touch: true },
        { name: 'iPad 竖屏', width: 820, height: 1180, touch: true },
        { name: '手机', width: 390, height: 844, touch: true },
        { name: '桌面', width: 1180, height: 820, touch: false },
    ]) {
        test.describe(`${ui} ${device.name} 统一来源`, () => {
            test.use({ viewport: { width: device.width, height: device.height }, hasTouch: device.touch, isMobile: device.touch });
            test('首页与本内添加页共用一排，文件直接分流到 PDF 导入', async ({ page, scenario }, testInfo) => {
                await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: `ui-style:${scenario.user.id}`, value: ui });
                await scenario.login(page);
                for (const path of [`/?notebook=${scenario.book.id}`, `/notebooks/${scenario.book.id}/add`]) {
                    await page.goto(path);
                    const sources = page.getByTestId('entry-sources');
                    await expect(sources).toBeVisible();
                    const row = page.getByTestId(device.touch ? 'entry-touch-sources' : 'entry-desktop-sources');
                    await expect(row).toBeVisible();
                    if (device.touch) {
                        for (const label of ['拍照', '相册', '文件', '打字']) await expect(row.getByRole('button', { name: label, exact: true })).toBeVisible();
                    } else {
                        await expect(page.getByTestId('entry-file-picker')).toBeVisible();
                        await expect(row.getByRole('button', { name: '打字', exact: true })).toBeVisible();
                        await expect(page.getByTestId('entry-touch-sources')).toBeHidden();
                    }
                    await expect(sources.getByRole('link', { name: '用 AI 助手批量导入 ›', exact: true })).toHaveAttribute('href', '/me#agent-settings');
                    await expect(page.getByRole('tab', { name: /^(图片|文字|文件|AI Agent)$/ })).toHaveCount(0);
                    await expectNoHorizontalOverflow(page);
                    await testInfo.attach(path.startsWith('/?') ? 'today-entry' : 'notebook-entry', { body: await page.screenshot(), contentType: 'image/png' });
                    await page.getByTestId('file-input').setInputFiles({
                        name: 'entry.pdf', mimeType: 'application/pdf',
                        buffer: Buffer.from(makeTextPdf([[{ text: '1. Compute 2 + 3.', y: 72 }]])),
                    });
                    await expect(page.getByTestId('file-import-summary')).toContainText('entry.pdf');
                    await expect(page.getByRole('heading', { name: /裁剪|Crop/ })).toHaveCount(0);
                }
            });
        });
    }
}
