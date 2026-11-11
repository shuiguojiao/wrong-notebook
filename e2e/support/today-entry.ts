import type { Page } from './fixtures';

/** 首页和错题本内共用来源入口；图片聚焦不自动弹出相机。 */
export async function openEntry(page: Page, label: '图片' | '文字' | '文件') {
    const sources = page.getByTestId('entry-sources');
    await sources.waitFor({ state: 'visible' });
    if (label === '图片') {
        await page.evaluate(() => window.dispatchEvent(new Event('focus-photo-entry')));
    } else if (label === '文字') {
        await sources.getByRole('button', { name: '打字', exact: true }).filter({ visible: true }).click();
    } else {
        const touch = page.getByTestId('entry-touch-sources');
        if (await touch.isVisible()) await touch.getByRole('button', { name: '文件', exact: true }).click();
        else await page.getByTestId('entry-file-picker').click();
    }
}
