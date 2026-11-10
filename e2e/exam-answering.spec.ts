import { test, expect } from './support/fixtures';

for (const viewport of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    for (const ui of ['notebook', 'simple']) {
        for (const colorScheme of ['light', 'dark'] as const) {
            test.describe(`${viewport.width}×${viewport.height} ${ui} ${colorScheme}`, () => {
                test.use({ viewport, hasTouch: true, colorScheme });
                test('开始、键盘两题、小旗、交卷、批改和确认保存', async ({ page, scenario }) => {
                    const a = await scenario.item('A');
                    const b = await scenario.item('B');
                    const paper = await scenario.db.examPaper.create({ data: {
                        userId: scenario.user.id, title: `在线作答 ${scenario.marker}`, status: 'ready', scope: 'all', difficulty: 'medium', mode: 'original', requestedCount: 2, subjectIds: JSON.stringify([scenario.book.id]),
                        questions: { create: [a, b].map((item, order) => ({ order, errorItemId: item.id, sourceShortId: item.shortId!, questionText: item.questionText, answerText: item.answerText, analysis: item.analysis, status: 'ready' })) },
                    } });
                    await scenario.login(page);
                    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: `ui-style:${scenario.user.id}`, value: ui });
                    await page.goto(`/exams/${paper.id}`);
                    // 使用真实主题属性覆盖以检查两套样式的相同交互。
                    await page.evaluate(style => document.documentElement.dataset.ui = style, ui);
                    await page.getByRole('button', { name: '开始作答', exact: true }).click();
                    await expect(page.getByTestId('exam-answering')).toBeVisible();
                    await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0);
                    const numbers = page.getByRole('navigation', { name: '题号' });
                    const legend = numbers.locator('p');
                    if (viewport.width >= 1024) await expect(legend).toBeVisible();
                    else {
                        await expect(legend).toBeHidden();
                        await numbers.locator('button[aria-expanded]').click();
                        await expect(legend).toBeVisible();
                        await numbers.locator('button[aria-expanded]').click();
                        await expect(legend).toBeHidden();
                    }
                    const answer = page.getByRole('textbox').filter({ visible: true });
                    await answer.fill('我的解答：长乘宽');
                    await answer.scrollIntoViewIfNeeded();
                    const answerBox = await answer.boundingBox();
                    const footerBox = await page.locator('main > footer').boundingBox();
                    expect(answerBox).not.toBeNull();
                    expect(footerBox).not.toBeNull();
                    expect(answerBox!.y + answerBox!.height).toBeLessThanOrEqual(footerBox!.y);
                    await page.getByRole('button', { name: '等会再看', exact: true }).filter({ visible: true }).click();
                    await page.getByRole('button', { name: '下一题', exact: true }).click();
                    await page.getByRole('textbox').filter({ visible: true }).fill('列式后计算面积');
                    await scenario.control({ hold: true });
                    await page.getByRole('button', { name: '交卷', exact: true }).click();
                    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '交卷', exact: true }) });
                    await expect(dialog).toContainText('已答 2/2');
                    await expect(dialog).toContainText('等会再看');
                    await dialog.getByRole('button', { name: '交卷', exact: true }).click();
                    await expect(page.getByText('正在批改 0/2', { exact: true })).toBeVisible();
                    await scenario.control({ hold: false });
                    await expect(page.getByRole('button', { name: '确认并保存', exact: true })).toBeEnabled({ timeout: 15000 });
                    expect((await scenario.model()).calls.filter(call => call.operation === 'grade')).toHaveLength(2);
                    await page.getByRole('button', { name: '确认并保存', exact: true }).click();
                    await expect(page.getByRole('button', { name: '改结果', exact: true })).toBeVisible();
                    const attempt = await scenario.db.examAttempt.findFirstOrThrow({ where: { paperId: paper.id }, include: { answers: true, practiceRecords: true } });
                    expect(attempt.status).toBe('done');
                    expect(attempt.answers.every(answer => answer.gradingImages === null)).toBe(true);
                    expect(attempt.practiceRecords).toHaveLength(2);
                });
            });
        }
    }
}
