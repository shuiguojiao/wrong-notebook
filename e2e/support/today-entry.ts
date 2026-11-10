import type { Page } from './fixtures';

/** 首页先展开后置录入，错题本内继续使用原页签。 */
export async function openEntry(page: Page, label: '图片' | '文字' | '文件') {
    const actions = page.getByTestId('today-entry-actions');
    if (new URL(page.url()).pathname === '/' && !(await page.locator('#question-entry').count())) {
        if (label === '图片') {
            await actions.getByRole('button', { name: '拍照', exact: true }).click();
        } else {
            await actions.getByRole('button', { name: '更多', exact: true }).click();
            await page.getByRole('menuitem', { name: label, exact: true }).click();
        }
    }
    await page.getByRole('tab', { name: label, exact: true }).click();
}
