import { test, expect } from './support/fixtures';
import { TINY_PNG_DATA_URL } from './support/e6-helpers';

for (const theme of ['light', 'dark'] as const) {
    test(`[A4] 错题列表在手机可滚动查看并适配双栏桌面（${theme}）`, async ({ page, scenario }, testInfo) => {
        await scenario.db.user.update({ where: { id: scenario.user.id }, data: { themePreference: theme } });
        for (let index = 0; index < 6; index++) {
            await scenario.item(`list-${index}`, {
                questionText: `根据拼音写出括号里的汉字。\n\n第${index + 1}题：花团 jǐn cù（　　），请结合上下文填写。`,
                source: '语文七年级上.pdf｜第1页',
                createdAt: new Date('2026-11-09T01:00:00Z'),
                originalImageUrl: index < 3 ? TINY_PNG_DATA_URL : '',
            });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await scenario.login(page);
        await page.goto(`/notebooks/${scenario.book.id}`);
        const rows = page.getByTestId('error-row');
        await expect(rows).toHaveCount(6);
        await expect(rows.first()).not.toContainText('根据拼音写出括号里的汉字');
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/);
        const sixth = await rows.nth(5).boundingBox();
        const bottomNav = await page.locator('nav.fixed').boundingBox();
        expect(sixth).not.toBeNull();
        expect(bottomNav).not.toBeNull();
        await rows.nth(5).evaluate(element => element.scrollIntoView({ block: "center" }));
        const visibleSixth = await rows.nth(5).boundingBox();
        expect(visibleSixth!.y + visibleSixth!.height).toBeLessThanOrEqual(bottomNav!.y);
        await expect(page.locator('a.fixed').filter({ hasText: '添加' })).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        await page.screenshot({ path: testInfo.outputPath(`notebook-mobile-${theme}.png`) });

        await page.getByRole('button', { name: '筛选', exact: true }).click();
        const mobilePanel = await page.getByRole('dialog').boundingBox();
        expect(mobilePanel!.x).toBe(0);
        expect(mobilePanel!.y + mobilePanel!.height).toBe(844);
        await page.getByRole('dialog').getByRole('button', { name: '完成', exact: true }).click();

        for (const viewport of [{ width: 1180, height: 820 }, { width: 1280, height: 900 }]) {
            await page.setViewportSize(viewport);
            await page.evaluate(() => window.scrollTo(0, 0));
            const sidebar = page.locator('main > aside');
            await expect(sidebar).toBeVisible();
            expect((await sidebar.boundingBox())!.width).toBe(320);
            await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
            await expect(sidebar.locator('[aria-current="page"]')).toHaveCSS('outline-style', 'solid');
            await expect(sidebar.locator('[aria-current="page"]')).toHaveCSS('outline-width', '2px');
            const first = await rows.first().boundingBox();
            const second = await rows.nth(1).boundingBox();
            expect(first!.x).toBe(second!.x);
            expect(first!.y).toBeLessThan(second!.y);
            await page.screenshot({ path: testInfo.outputPath(`notebook-${viewport.width}-${theme}.png`) });
        }
        await page.getByRole('button', { name: '筛选', exact: true }).click();
        const desktopPanel = await page.getByRole('dialog').boundingBox();
        expect(desktopPanel!.x + desktopPanel!.width).toBe(1280);
        expect(desktopPanel!.height).toBe(900);
    });
}
