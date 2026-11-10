import { test, expect } from './support/fixtures';
import { importImage } from './support/flows';
import { acceptConfirmDialog } from './helpers';

test('图片识别经人工校对后保存、刷新并删除', async ({ page, scenario }) => {
    const item = await importImage(page, scenario, true);
    await expect(page.getByText('校对后的方程', { exact: false })).toBeVisible();
    // 改版后掌握状态显示在“复习”摘要按钮中，删除等操作收进“更多”菜单。
    await expect(page.getByRole('button', { name: /复习.*还没掌握/ })).toBeVisible();
    expect(item.masteryLevel).toBe(0);
    await page.getByRole('button', { name: '更多', exact: true }).click();
    await page.getByRole('menuitem', { name: '删除', exact: true }).click();
    await acceptConfirmDialog(page);
    await expect.poll(() => scenario.db.errorItem.count({ where: { id: item.id } })).toBe(0);
    await page.goto(`/notebooks/${scenario.book.id}`);
    await expect(page.getByText('0 道 · 还没掌握 0', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '更多', exact: true }).click();
    await page.getByRole('menuitem', { name: '删除', exact: true }).click();
    await acceptConfirmDialog(page);
    await page.waitForURL('**/notebooks');
    expect(await scenario.db.subject.findUnique({ where: { id: scenario.book.id } })).toBeNull();
});
