import { test, expect } from './support/fixtures';

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1180, height: 820 }]) {
    test(`学生四入口与我的（${viewport.width}）`, async ({ page, scenario }, testInfo) => {
        await page.setViewportSize(viewport);
        await scenario.login(page);
        await page.goto('/');
        const nav = page.getByTestId('student-navigation');
        const tabs = nav.locator('div a');
        await expect(tabs).toHaveText(['今天', '错题本', '收集册', '我的']);
        const rail = await nav.boundingBox();
        expect(rail).not.toBeNull();
        if (viewport.width >= 768) {
            expect(rail!.width).toBe(88);
            expect((await page.locator('main').boundingBox())!.x).toBeGreaterThanOrEqual(88);
            await nav.getByRole('link', { name: '拍照', exact: true }).click();
            await expect(page.locator('#question-entry')).toBeFocused();
        } else {
            await expect(nav.getByRole('link', { name: '拍照', exact: true })).toBeHidden();
            expect(rail!.y + rail!.height).toBe(viewport.height);
        }
        await page.screenshot({ path: testInfo.outputPath(`student-shell-${viewport.width}.png`) });
        await tabs.filter({ hasText: '收集册' }).click();
        await expect(page.getByRole('heading', { name: '收集册', exact: true })).toBeVisible();
        await tabs.filter({ hasText: '我的' }).click();
        await expect(page.locator('main a[href="/admin"]')).toHaveCount(0);
        await expect(page.locator('[aria-labelledby="me-learning"] a[href="/import-tasks"]')).toHaveText('上传记录');
        const settings = page.locator('[aria-labelledby="me-settings"]');
        await expect(settings.locator('.divide-y > :last-child')).toHaveText('后台任务');
        await settings.getByRole('button', { name: '后台任务', exact: true }).click();
        await expect(page.getByRole('dialog', { name: '后台任务' })).toBeVisible();
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'AI Agent 接入', exact: true }).click();
        await expect(page.getByRole('tab', { name: '账户', exact: true })).toHaveAttribute('data-state', 'active');
        await page.keyboard.press('Escape');
        await page.goto('/stats');
        await expect(nav.locator('[aria-current="page"]')).toHaveText('我的');
        await page.goto('/me');
        await page.getByRole('button', { name: '退出登录', exact: true }).click();
        await page.waitForURL('**/login');
    });
}
