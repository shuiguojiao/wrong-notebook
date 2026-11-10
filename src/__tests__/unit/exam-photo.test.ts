import { describe, expect, it, vi } from 'vitest';
import { BaseAIProvider } from '@/lib/ai/base-provider';
import type { CompletionRequest } from '@/lib/ai/base-provider';
import { ANSWER_IMAGE } from '../fixtures/handwriting';
import { generateExamLocationRequest } from '@/lib/ai/prompts/exam-location';
import { parseExamAnswers } from '@/lib/ai/response-parser';
import { examPageIssue, hasMajorityHandMarks, MAX_EXAM_PAGES, moveExamPage, pageIssuesSchema } from '@/lib/exam/exam-photo-schema';
import { groupAttemptQuestions } from '@/lib/exam/exam-attempt-view';
import { examAttempt, attemptAnswer } from '../fixtures/exam-attempt';

vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), warn: vi.fn() }) }));
describe('试卷照片定位与检查规则', () => {
    it.each(['zh', 'en'] as const)('提示词 %s 限制只转写、不判题，题干截为 80 字', language => {
        const prompt = generateExamLocationRequest({ image: '', paperCode: 'K7Q2', language, questions: [{ number: 1, questionType: null, questionText: '题'.repeat(100) }] });
        expect(prompt.system).toContain(language === 'zh' ? '不判对错' : 'Do not grade');
        expect(prompt.system).toContain(language === 'zh' ? '不确定题号时不要猜' : 'Never guess');
        expect(prompt.system).toContain('handMark');
        expect(JSON.parse(prompt.user).questions[0].questionText).toHaveLength(80);
    });
    it('缺少 pageReadable 拒绝解析，其余字段保守默认，区域越界裁到图内', () => {
        expect(() => parseExamAnswers('{}')).toThrow();
        const result = parseExamAnswers(JSON.stringify({ pageReadable: true, answers: [{ number: 1, region: { x: -0.1, y: 0.9, width: 1.5, height: 0.5 } }] }));
        expect(result.paperCode).toBe('');
        expect(result.answers[0]).toMatchObject({ transcript: '', legible: false, handMark: 'none', region: { x: 0, y: 0.9, width: 1 } });
        expect(result.answers[0].region.height).toBeCloseTo(0.1);
        expect(() => parseExamAnswers('{"pageReadable":true,"answers":[{"number":1}]}')).toThrow();
    });
    it('看不清优先，卷号空白可通过，卷号不一致返回问题页', () => {
        expect(examPageIssue({ pageReadable: false, paperCode: 'OTHER', answers: [] }, 'K7Q2')).toBe('unreadable');
        expect(examPageIssue({ pageReadable: true, paperCode: '', answers: [] }, 'K7Q2')).toBeNull();
        expect(examPageIssue({ pageReadable: true, paperCode: 'OTHER', answers: [] }, 'K7Q2')).toBe('wrong_paper');
    });
    it.each([
        ['K7Q2', null], [' k7q2 ', null], ['K7O2', null], ['X7Q2', null],
        ['X7Q3', 'wrong_paper'], ['X8Q3', 'wrong_paper'], ['K7Q', 'wrong_paper'], ['K7Q22', 'wrong_paper'],
    ])('卷号 %s 同长度容错一个字符，两个及以上或长度不同要提示', (paperCode, expected) => {
        expect(examPageIssue({ pageReadable: true, paperCode: paperCode!, answers: [] }, 'K7Q2')).toBe(expected);
    });
    it('整卷定位失败只允许下标 -1，页级问题仍限定实际页范围', () => {
        expect(pageIssuesSchema.parse([{ index: -1, reason: 'locate_failed' }])).toHaveLength(1);
        for (const issue of [{ index: 0, reason: 'locate_failed' }, { index: -1, reason: 'unreadable' }, { index: 8, reason: 'wrong_paper' }]) {
            expect(pageIssuesSchema.safeParse([issue]).success).toBe(false);
        }
    });
    it('红笔达到原题一半才预填，空卷不算已批改', () => {
        expect(hasMajorityHandMarks(['correct', null], 2)).toBe(true);
        expect(hasMajorityHandMarks(['wrong', null, null], 3)).toBe(false);
        expect(hasMajorityHandMarks([], 0)).toBe(false);
        expect(hasMajorityHandMarks(['none', null], 2)).toBe(false);
    });
    it('照片上限八张，排序不修改原数组，越界不移动', () => {
        expect(MAX_EXAM_PAGES).toBe(8);
        const pages = ['a', 'b', 'c'];
        expect(moveExamPage(pages, 0, 2)).toEqual(['b', 'c', 'a']);
        expect(pages).toEqual(['a', 'b', 'c']);
        expect(moveExamPage(pages, 1, -1)).toBe(pages);
    });
    it('没找到的题等待人工选择，选择没做后进入没做组，红笔冲突仍要看一眼', () => {
        const attempt = examAttempt();
        attempt.kind = 'photo';
        attempt.answers = [{ ...attemptAnswer('q1'), aiReason: 'EXAM_ANSWER_NOT_FOUND' }, { ...attemptAnswer('q2', 'correct'), handMark: 'correct', aiResult: 'wrong' }, attemptAnswer('q3', 'correct')];
        expect(groupAttemptQuestions(attempt)[0].items.map(item => item.question.id)).toEqual(['q1', 'q2']);
        attempt.answers[0].finalResult = 'not_attempted';
        expect(groupAttemptQuestions(attempt).find(group => group.key === 'not_attempted')?.items[0].question.id).toBe('q1');
    });
});


class LocationProvider extends BaseAIProvider {
    protected readonly providerName = '测试';
    request?: CompletionRequest;
    protected async complete(request: CompletionRequest): Promise<string> {
        this.request = request;
        return '{"pageReadable":true,"paperCode":"K7Q2","answers":[]}';
    }
}

it('基类定位方法传递照片与题目清单，并使用现有判题传输任务', async () => {
    const provider = new LocationProvider();
    expect(await provider.locateExamAnswers({ image: ANSWER_IMAGE, paperCode: 'K7Q2', questions: [] })).toEqual({ pageReadable: true, paperCode: 'K7Q2', answers: [] });
    expect(provider.request).toMatchObject({ task: 'grading', image: { mimeType: 'image/png' } });
    expect(provider.request?.user).toContain('K7Q2');
});
