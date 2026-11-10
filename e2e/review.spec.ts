import { test, expect, type Page } from './support/fixtures';
import { ADMIN_PASSWORD } from './helpers';

async function login(page: Page) {
    await page.goto('/login');
    await page.getByLabel(/邮箱|Email/).fill('admin@localhost');
    await page.getByLabel(/^密码$|^Password$/).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /登录|Login/ }).click();
    await page.waitForURL('**/', { timeout: 15000 });
}

test('做错的题按计划出现在今日复习中，首页显示今天要复习数量', async ({ page }) => {
    test.setTimeout(60000);
    await login(page);

    // 用化学学科：其他用例按「数学」查找错题本，名称匹配为子串匹配
    const notebookRes = await page.request.post('/api/notebooks', {
        data: { name: `复习测试-${Date.now()}`, stage: 'junior_high', subjectKey: 'chemistry' },
    });
    expect(notebookRes.ok()).toBeTruthy();
    const notebook = await notebookRes.json();
    const questionText = `水的化学式是什么？${Date.now() % 1000}`;
    const itemRes = await page.request.post('/api/error-items', {
        data: { subjectId: notebook.id, questionText, answerText: 'H₂O', analysis: '两个氢原子和一个氧原子。', knowledgePoints: ['化学式'] },
    });
    expect(itemRes.ok()).toBeTruthy();
    const item = await itemRes.json();

    // 七天前做错：已超过方法型首轮窗口上限，确保题目到期
    const takenAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recordRes = await page.request.post('/api/practice/record', {
        data: { errorItemId: item.id, result: 'wrong', source: 'manual', takenAt },
    });
    expect(recordRes.ok()).toBeTruthy();

    try {
        await page.goto('/');
        const dueTile = page.getByRole('link', { name: /今天要复习/ });
        await expect(dueTile).toBeVisible({ timeout: 15000 });
        await expect(dueTile).not.toContainText('–');

        await dueTile.click();
        await page.waitForURL('**/review');
        await expect(page.getByRole('heading', { name: '今日复习' })).toBeVisible();
        await expect(page.getByRole('link', { name: '开始复习' })).toBeVisible();
        await page.getByText('查看今日题目', { exact: true }).click();
        const entry = page.locator('ol li').filter({ hasText: questionText });
        await expect(entry).toBeVisible();
        await expect(entry.getByRole('link')).toHaveAttribute('href', `/error-items/${item.id}`);
        await expect(entry).not.toContainText('轮');
        await expect(entry.getByRole('button', { name: '举一反三' })).toHaveCount(0);
    } finally {
        expect((await page.request.delete(`/api/error-items/${item.id}/delete`)).ok()).toBeTruthy();
        expect((await page.request.delete(`/api/notebooks/${notebook.id}`)).ok()).toBeTruthy();
    }
});


// 界面用例拦截 AI 与记录接口；归属、来源及调度恢复由集成测试覆盖。
async function mockReview(page: Page, empty = false) {
    await page.route('**/api/review/due**', route => route.fulfill({ json: { dailyMinutes: 30, consumedMinutes: 0, remainingMinutes: 30, estimatedMinutes: empty ? 0 : 4, tomorrowMinutes: 4, todayDurationSec: 0, todayReviewed: 0, backlogHint: false, dayKey: 'review-ui:2026-11-08', items: empty ? [] : [
        { id: 'review-ui', estimatedSec: 240, subjectId: 'math', subjectName: '数学', questionPreview: '求 1+1', questionPreviewMarkdown: '求 $1+1$', nextReviewAt: '2026-11-08T00:00:00Z' },
    ] } }));
    await page.route('**/api/error-items/review-ui', route => route.fulfill({ json: {
        id: 'review-ui', questionText: '求 1+1', answerText: '2', analysis: '相加得到 2', wrongAnswerText: '3', originalImageUrl: '',
    } }));
    await page.route('**/api/practice/grade', route => route.fulfill({ json: { correct: true, reason: '答案一致' } }));
    await page.route('**/api/practice/record', route => route.fulfill({ json: {
        id: 'review-ui-record', result: 'correct', durationSec: 125, reviewPlan: { stage: 1, nextReviewAt: '2026-11-10T00:00:00Z' },
    } }));
    await page.route('**/api/review/undo?*', route => route.fulfill({ json: { success: true } }));
}

test('手机专注复习：空提交提示、一步确认和最后一题撤销', async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await mockReview(page);
    await page.goto('/review');
    await page.getByText('查看今日题目', { exact: true }).click();
    await expect(page.locator('ol .katex')).toBeVisible();
    await page.getByRole('link', { name: '开始复习', exact: true }).click();
    const current = () => page.locator('[data-review-question]:visible');
    await expect(current()).toContainText('数学 · 1 / 1');
    await expect(page.getByRole('navigation')).toHaveCount(0);
    const submit = page.getByRole('button', { name: '提交', exact: true });
    await expect(submit).toBeEnabled();
    await submit.click();
    // Next 的路由播报也是 role=alert，按文字筛出表单提示
    await expect(page.getByRole('alert').filter({ hasText: '请先填写答案或手写作答' })).toBeVisible();
    await page.getByLabel('你的答案', { exact: true }).fill('2');
    await submit.click();
    await expect(current()).toContainText('与标准答案一致：做对了');
    await expect(current().getByRole('button', { name: '跳过', exact: true })).toHaveCount(0);
    await expect(current().locator('details').filter({ hasText: '详细解析' })).not.toHaveAttribute('open');
    await current().locator('summary').filter({ hasText: '再来一道类似的' }).click();
    await expect(current().getByRole('link', { name: '换一道类似题' })).toBeVisible();
    await current().getByRole('button', { name: '对，不太确定', exact: true }).click();
    await expect(page.getByRole('heading', { name: '本次复习小结' })).toBeVisible();
    await expect(page.locator('ol:visible .katex')).toBeVisible();
    await expect(page.locator('dd:visible')).toHaveText(['1', '0', '0']);
    await expect(page.getByText('用时 2 分 5 秒', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '再来一组', exact: true })).toBeVisible();
    const undoRequest = page.waitForRequest(request => request.url().includes('/api/review/undo?') && request.method() === 'DELETE');
    await page.getByRole('button', { name: '撤销复习结果', exact: true }).click();
    expect((await undoRequest).url()).toContain('recordId=review-ui-record');
    await expect(current()).toContainText('与标准答案一致：做对了');
    await expect(current().getByRole('button', { name: '对，不太确定', exact: true })).toBeEnabled();
    await expect(page.getByRole('heading', { name: '本次复习小结' })).toHaveCount(0);
});

test('保存失败停留判题页，可重新确认', async ({ page }) => {
    await login(page);
    await mockReview(page);
    await page.route('**/api/practice/record', route => route.fulfill({ status: 500, json: { message: '保存失败' } }));
    await page.goto('/review/session');
    await page.getByLabel('你的答案', { exact: true }).fill('2');
    await page.getByRole('button', { name: '提交', exact: true }).click();
    await page.getByRole('button', { name: '对，不太确定', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: '保存' })).toBeVisible();
    await expect(page.getByRole('button', { name: '做错了', exact: true })).toBeEnabled();
    await expect(page.locator('[data-review-question]:visible')).toContainText('你的答案');
    await expect(page.getByRole('heading', { name: '本次复习小结' })).toHaveCount(0);
});

test('没有到期题时不显示题量和开始入口', async ({ page }) => {
    await login(page);
    await mockReview(page, true);
    await page.goto('/review');
    await expect(page.getByText('今天没有需要复习的错题', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '开始复习', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '再来一组', exact: true })).toHaveCount(0);
    await expect(page.getByText('明天约 4 分钟', { exact: true })).toBeVisible();
    await expect(page.getByText('查看今日题目', { exact: true })).toHaveCount(0);
});
