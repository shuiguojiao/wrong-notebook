import { resolve } from 'node:path';
import { test, expect } from './support/fixtures';

for (const viewport of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    for (const ui of ['notebook', 'simple']) {
        test.describe(`${viewport.width}×${viewport.height} ${ui}`, () => {
            test.use({ viewport, hasTouch: true });
            test('两页照片交卷，没找到的题选没做，再确认保存', async ({ page, scenario }) => {
                const items = [await scenario.item('A'), await scenario.item('B')];
                const paper = await scenario.db.examPaper.create({ data: {
                    userId: scenario.user.id, title: `拍照交卷 ${scenario.marker}`, status: 'ready', scope: 'all', difficulty: 'medium', mode: 'original', requestedCount: 2, subjectIds: JSON.stringify([scenario.book.id]),
                    questions: { create: items.map((item, order) => ({ order, errorItemId: item.id, sourceShortId: item.shortId!, questionText: item.questionText, answerText: item.answerText, analysis: item.analysis, status: 'ready' })) },
                } });
                await scenario.control({ locateNumbers: [1] });
                await scenario.login(page);
                await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: `ui-style:${scenario.user.id}`, value: ui });
                await page.goto(`/exams/${paper.id}`);
                await page.getByRole('button', { name: '拍照交卷', exact: true }).click();
                const photo = resolve('src/__tests__/fixtures/images/multi-question-page.jpg');
                await page.getByLabel('从相册选', { exact: true }).setInputFiles([photo, photo]);
                await expect(page.getByText('已上传', { exact: true })).toHaveCount(2);
                await page.getByRole('button', { name: '交卷，开始批改', exact: true }).click();
                const dialog = page.getByRole('dialog');
                await expect(dialog).toContainText('共 2 页，交卷后开始批改');
                await dialog.getByRole('button', { name: '交卷，开始批改', exact: true }).click();
                await expect(page.getByText('没找到这题的作答', { exact: true })).toBeVisible({ timeout: 30000 });
                const missing = page.locator('[data-question-id]').filter({ hasText: '没找到这题的作答' });
                await missing.getByRole('button', { name: '没做', exact: true }).click();
                await page.getByRole('button', { name: '确认并保存', exact: true }).click();
                await expect(page.getByRole('button', { name: '改结果', exact: true })).toBeVisible();
                const attempt = await scenario.db.examAttempt.findFirstOrThrow({ where: { paperId: paper.id }, include: { answers: true, practiceRecords: true } });
                expect(attempt).toMatchObject({ kind: 'photo', status: 'done' });
                expect(JSON.parse(attempt.pageImages!)).toHaveLength(2);
                expect(attempt.answers.every(answer => answer.gradingImages === null)).toBe(true);
                expect(attempt.practiceRecords).toHaveLength(2);
            });
        });
    }
}
