import { test, expect } from './support/fixtures';

for (const viewport of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    test(`做题记录入口、筛选和详情（${viewport.width}）`, async ({ page, scenario }) => {
        await page.setViewportSize(viewport);
        const item = await scenario.item('H', { questionText: '计算 $x^2$，其中 $x=3$。', answerText: '9', analysis: '将 3 代入。' });
        const now = new Date();
        const wrong = await scenario.db.practiceRecord.create({ data: {
            userId: scenario.user.id, errorItemId: item.id, source: 'review', result: 'wrong', isCorrect: false,
            createdAt: now, durationSec: 80, confidence: 'unsure', wrongAnswerText: '6', gradeReason: '平方不是乘以二。',
        } });
        const correct = await scenario.db.practiceRecord.create({ data: {
            userId: scenario.user.id, errorItemId: item.id, source: 'review', result: 'correct', isCorrect: true,
            createdAt: now, durationSec: 20, confidence: 'sure', wrongAnswerText: '9',
        } });
        await scenario.login(page);
        await page.goto('/me');
        await page.getByRole('link', { name: '做题记录', exact: true }).click();
        await expect(page.getByRole('heading', { name: '做题记录', exact: true })).toBeVisible();
        await expect(page.locator(`[data-record-id="${wrong.id}"]`)).toBeVisible();
        await expect(page.locator(`[data-record-id="${correct.id}"]`)).toBeVisible();
        if (viewport.width < 1024) await page.getByRole('button', { name: '筛选', exact: true }).click();
        await page.getByRole('switch', { name: '只看差一点', exact: true }).click();
        await expect(page).toHaveURL(/result=wrong/);
        if (viewport.width < 1024) await page.getByRole('button', { name: '关闭', exact: true }).click();
        await expect(page.locator(`[data-record-id="${correct.id}"]`)).toHaveCount(0);
        await page.locator(`[data-record-id="${wrong.id}"]`).click();
        await expect(page).toHaveURL(new RegExp(`record=${wrong.id}`));
        const detail = page.getByTestId('history-detail');
        await expect(detail.getByRole('heading', { name: '我当时写的', exact: true })).toBeVisible();
        await expect(detail.getByText('6', { exact: true })).toBeVisible();
        await page.reload();
        await expect(page.getByTestId('history-detail')).toBeVisible();
        if (viewport.width >= 1024) {
            await page.getByRole('button', { name: '关闭作答详情，返回当天小结', exact: true }).click();
            await expect(page.getByRole('heading', { name: '当天小结', exact: true })).toBeVisible();
            await expect(page.locator(`[data-record-id="${wrong.id}"]`)).toHaveAttribute('aria-pressed', 'false');
            await page.locator(`[data-record-id="${wrong.id}"]`).click();
        }
        await page.getByRole('link', { name: '打开原题', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/error-items/${item.id}$`));
    });
}
