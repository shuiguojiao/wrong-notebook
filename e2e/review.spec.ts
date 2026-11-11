import { test, expect, type Page } from './support/fixtures';
import { ADMIN_PASSWORD } from './helpers';

async function login(page: Page) {
    await page.goto('/login');
    await page.getByLabel(/邮箱|Email/).fill('admin@localhost');
    await page.getByLabel(/^密码$|^Password$/).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /登录|Login/ }).click();
    await page.waitForURL('**/', { timeout: 15000 });
}

test('收集册切换成就页签后显示已获得计数，刷新保留页签', async ({ page }) => {
    await login(page);
    await page.route('**/api/user', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, json: { ...await response.json(), rewardsEnabled: true } });
    });
    await page.route('**/api/rewards/badges', route => route.fulfill({ json: { badges: [] } }));
    await page.goto('/collection');
    await page.getByRole('tab', { name: '成就', exact: true }).click();
    await expect(page).toHaveURL(/tab=badges/);
    await expect(page.getByText('已获得 0 / 16 枚', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('tab', { name: '成就', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('已获得 0 / 16 枚', { exact: true })).toBeVisible();
});

test('收集册切到趣味贴纸显示收集计数', async ({ page }) => {
    await login(page);
    await page.route('**/api/user', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, json: { ...await response.json(), rewardsEnabled: true } });
    });
    await page.route('**/api/rewards/fun-stickers', route => route.fulfill({ json: { stickers: [], sets: [] } }));
    await page.goto('/collection');
    await page.getByRole('tab', { name: '趣味贴纸', exact: true }).click();
    await expect(page).toHaveURL(/tab=fun/);
    await expect(page.getByText('已收集 0 / 36 张', { exact: true })).toBeVisible();
});

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
        await expect(page.getByRole('heading', { name: '今天要复习', exact: true })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('link', { name: '开始复习' })).toBeVisible();
        await page.goto('/review');
        await expect(page.getByRole('link', { name: '回今天', exact: true })).toBeVisible();
        const list = page.locator('#today-questions');
        if (await list.getAttribute('open') === null) await list.locator('summary').click();
        const showAll = list.getByRole('button', { name: /查看全部/ });
        if (await showAll.count()) await showAll.click();
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
    const subjectRow = page.locator('section[aria-label="今天要复习"] ul a');
    await expect(subjectRow).toHaveAttribute('href', '/review/session?subjectId=math&autostart=1');
    await expect(subjectRow.getByRole('img', { name: '已复习 0 题，应复习 1 题', exact: true })).toHaveText('0/1');
    await expect(subjectRow.getByRole('checkbox')).toHaveCount(0);
    await page.locator('#today-questions summary').click();
    await expect(page.locator('ol .katex')).toBeVisible();
    await page.getByRole('link', { name: '开始复习', exact: true }).click();
    const current = () => page.locator('[data-review-question]:visible');
    await expect(current()).toContainText('数学 · 第 1 题 / 共 1 题');
    await expect(page.getByRole('navigation')).toHaveCount(0);
    const submit = page.getByRole('button', { name: '提交，看看对不对', exact: true }).filter({ visible: true });
    await expect(submit).toBeEnabled();
    await submit.click();
    // Next 的路由播报也是 role=alert，按文字筛出表单提示
    await expect(page.getByRole('alert').filter({ hasText: '请先填写答案、手写作答或添加照片' })).toBeVisible();
    await page.getByLabel('我的答案', { exact: true }).fill('2');
    await submit.click();
    await expect(current()).toContainText('做对了');
    await expect(current().getByRole('button', { name: '跳过', exact: true })).toHaveCount(0);
    await expect(current().locator('details').filter({ hasText: '详细解析' })).not.toHaveAttribute('open');
    await current().locator('summary').filter({ hasText: '再来一道类似的' }).click();
    await expect(current().getByRole('link', { name: '再来一道类似的' })).toBeVisible();
    await current().getByRole('button', { name: '还不太熟', exact: true }).click();
    await expect(page.getByRole('heading', { name: '这一组做完啦' })).toBeVisible();
    await expect(page.locator('ol:visible .katex')).toBeVisible();
    await expect(page.locator('dd:visible')).toHaveText(['1', '0', '–']);
    await expect(page.getByText('1 题 · 用了 3 分钟', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '还想做？再来 5 题', exact: true })).toBeVisible();
    const undoRequest = page.waitForRequest(request => request.url().includes('/api/review/undo?') && request.method() === 'DELETE');
    await page.getByRole('button', { name: '撤销复习结果', exact: true }).click();
    expect((await undoRequest).url()).toContain('recordId=review-ui-record');
    await expect(current()).toContainText('做对了');
    await expect(current().getByRole('button', { name: '还不太熟', exact: true })).toBeEnabled();
    await expect(page.getByRole('heading', { name: '这一组做完啦' })).toHaveCount(0);
});

test('保存失败停留判题页，可重新确认', async ({ page }) => {
    await login(page);
    await mockReview(page);
    await page.route('**/api/practice/record', route => route.fulfill({ status: 500, json: { message: '保存失败' } }));
    await page.goto('/review/session');
    await page.getByLabel('我的答案', { exact: true }).fill('2');
    await page.getByRole('button', { name: '提交，看看对不对', exact: true }).filter({ visible: true }).click();
    await page.getByRole('button', { name: '还不太熟', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: '保存' })).toBeVisible();
    await expect(page.getByRole('button', { name: '会了，下一题', exact: true })).toBeEnabled();
    await expect(page.locator('[data-review-question]:visible')).toContainText('你写的');
    await expect(page.getByRole('heading', { name: '这一组做完啦' })).toHaveCount(0);
});

for (const viewport of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    test(`图表题作答可主动查看原图并保留答案：${viewport.width}×${viewport.height}`, async ({ page }) => {
        await login(page);
        await page.setViewportSize(viewport);
        await mockReview(page);
        const imageUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white" /></svg>')}`;
        await page.route('**/api/error-items/review-ui', route => route.fulfill({ json: {
            id: 'review-ui', questionText: '请结合表中数据作答', answerText: '2', originalImageUrl: imageUrl,
        } }));
        await page.route('**/api/error-items/review-ui/source', route => route.fulfill({ json: {
            page: { id: 'source', imageUrl, width: 100, height: 100, fileName: '复习试卷', pageNumber: 1,
                origin: 'image', createdAt: '2026-11-10T00:00:00Z' },
            regions: [{ x: 0.1, y: 0.1, width: 0.8, height: 0.8, order: 0 }],
        } }));
        await page.goto('/review/session');
        await expect(page.getByRole('button', { name: '看原图', exact: true })).toBeVisible();
        await expect(page.getByText('原图上可能有答案', { exact: true })).toBeVisible();
        await expect(page.locator('.review-prompt img')).toHaveCount(0);
        await page.getByLabel('我的答案', { exact: true }).fill('2');
        await page.getByRole('button', { name: '看原图', exact: true }).click();
        const viewer = page.getByRole('dialog');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('img')).toHaveAttribute('src', imageUrl);
        await viewer.getByRole('button', { name: '关闭', exact: true }).click();
        await expect(viewer).toHaveCount(0);
        await expect(page.getByLabel('我的答案', { exact: true })).toHaveValue('2');
        await page.getByRole('button', { name: '提交，看看对不对', exact: true }).filter({ visible: true }).click();
        await expect(page.getByRole('heading', { name: '试卷原图', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '看原图', exact: true })).toHaveCount(0);
    });
}

test('没有到期题时不显示题量和开始入口', async ({ page }) => {
    await login(page);
    await mockReview(page, true);
    await page.goto('/review');
    await expect(page.getByText('今天没有需要复习的错题', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '开始复习', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '还想做？再来 5 题', exact: true })).toHaveCount(0);
    await expect(page.getByText('明天约 4 分钟', { exact: true })).toBeVisible();
    await expect(page.locator('#today-questions summary')).toHaveCount(0);
});

test('原题复习拍照裁剪后可直接提交进入对照', async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1180, height: 820 });
    await mockReview(page);
    await page.goto('/review/session');
    await page.getByRole('tab', { name: /拍照|上传照片/ }).click();
    // 复用其他拍照 E2E 已有的本地图片夹具。
    await page.locator('input[type="file"]:not([capture])').setInputFiles('src/__tests__/fixtures/images/math_test.png');
    const cropper = page.getByRole('dialog');
    await expect(cropper).toContainText('只留下你的解答部分');
    await cropper.getByRole('button', { name: '确认', exact: true }).click();
    await expect(cropper).toBeHidden();
    await expect(page.getByRole('button', { name: '重拍', exact: true })).toBeVisible();
    const grading = page.waitForRequest(request => request.url().endsWith('/api/practice/grade') && request.method() === 'POST');
    await page.getByRole('button', { name: '提交，看看对不对', exact: true }).filter({ visible: true }).click();
    const body = (await grading).postDataJSON();
    expect(body.answerImages).toHaveLength(1);
    expect(body.answerImages[0]).toMatch(/^data:image\/jpeg;base64,/);
    await expect(page.locator('[data-kind="mine"] img')).toBeVisible();
    await expect(page.locator('[data-review-question]:visible')).toContainText('做对了');
    await page.locator('[data-kind="mine"]').getByRole('button').click();
    await expect(page.getByRole('dialog').locator('img')).toBeVisible();
});

test('手写续纸变高，展开再收起仍保留笔迹', async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1180, height: 820 });
    await mockReview(page);
    await page.goto('/review/session');
    await page.getByRole('tab', { name: '手写', exact: true }).click();
    const canvas = page.getByLabel('手写作答画布', { exact: true });
    const paperHeight = async () => Number(await canvas.getAttribute('data-paper-height'));
    await expect.poll(paperHeight).toBeGreaterThan(0);
    const before = await paperHeight();
    const rect = (await canvas.boundingBox())!;
    await page.mouse.move(rect.x + 40, rect.y + 40);
    await page.mouse.down();
    await page.mouse.move(rect.x + 120, rect.y + 80, { steps: 8 });
    await page.mouse.up();
    await expect(canvas).toHaveAttribute('data-stroke-count', '1');
    await page.getByRole('button', { name: '再来一页', exact: true }).click();
    await expect.poll(paperHeight).toBeGreaterThan(before);
    const after = await paperHeight();
    await page.getByRole('button', { name: '展开', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '手写', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '收起', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(canvas).toHaveAttribute('data-stroke-count', '1');
    expect(await paperHeight()).toBe(after);
});


test('复习一题后收工显示这次的能量豆', async ({ page }) => {
    await login(page);
    await mockReview(page);
    // 保留真实用户信息（含 AI 授权状态），只覆盖奖励设置，避免弹出授权对话框挡住作答
    await page.route('**/api/user', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, json: { ...await response.json(), rewardsEnabled: true, weeklyGoalDays: 4 } });
    });
    await page.route('**/api/rewards/summary', route => route.fulfill({ json: {
        balance: 1, today: { day: '2026-11-08', points: 1, entries: [] },
        week: { start: '2026-11-02', goalDays: 4, completedDays: ['2026-11-08'] },
        streak: 1, reviewedToday: true, rulesVersion: 1, enabled: true,
        brave: null, recentBadges: [], badgeCount: 0,
        leave: { held: 0, max: 2, usedDay: null, earnedDay: null }, lastStreak: null, weekly: { reached: false, box: null },
    } }));
    await page.route('**/api/practice/record', route => route.fulfill({ json: {
        id: 'review-ui-record', result: 'correct', durationSec: 125,
        reviewPlan: { stage: 1, nextReviewAt: '2026-11-10T00:00:00Z' },
        rewards: [{ type: 'review', points: 1, meta: {}, createdAt: new Date().toISOString() }],
    } }));
    await page.goto('/review/session');
    await page.getByLabel('我的答案', { exact: true }).fill('2');
    await page.getByRole('button', { name: '提交，看看对不对', exact: true }).filter({ visible: true }).click();
    await page.getByRole('button', { name: '会了，下一题', exact: true }).click();
    const rewards = page.getByRole('region', { name: '这次的能量豆' });
    await expect(rewards).toBeVisible();
    await expect(rewards).toContainText('合计 1 颗');
    await expect(rewards).toContainText('现在一共 1 颗');
});
