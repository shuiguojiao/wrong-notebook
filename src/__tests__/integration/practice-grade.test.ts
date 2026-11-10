/**
 * 举一反三判题 API 集成测试
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    errorItem: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    gradeAnswer: vi.fn(),
    consumeAiQuota: vi.fn(),
    session: { user: { id: 'user-1', email: 'user@example.com' }, expires: '2099-01-01' },
    dbUser: { id: 'user-1', email: 'user@example.com', name: 'Test User' },
}));

vi.mock('@/lib/prisma', () => ({ prisma: { errorItem: mocks.errorItem, user: mocks.user } }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => ({ aiProvider: 'test', prompts: {} }) }));
vi.mock('@/lib/ai', () => ({ getAIService: () => ({ gradeAnswer: mocks.gradeAnswer }) }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(() => Promise.resolve(mocks.session)) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/ai-quota', () => ({ consumeAiQuota: mocks.consumeAiQuota }));

import { BaseAIProvider } from '@/lib/ai/base-provider';
import type { CompletionRequest } from '@/lib/ai/base-provider';
import { parseAnswerImage } from '@/lib/handwriting/image';
import { getPracticeVersion } from '@/lib/practice-version';
import { parseLastPractice } from '@/lib/last-practice';
import { ANSWER_IMAGE } from '../fixtures/handwriting';
import { POST } from '@/app/api/practice/grade/route';

const lastPractice = JSON.stringify({
    questionText: '解方程 x² = 4', answerText: 'x = 2 或 x = -2', analysis: '开平方', difficulty: 'medium', generatedAt: '2026-10-20T00:00:00.000Z',
});

const grade = (body: object) => POST(new Request('http://localhost/api/practice/grade', {
    method: 'POST',
    body: JSON.stringify({ practiceVersion: getPracticeVersion(parseLastPractice(lastPractice)!), ...body }),
    headers: { 'Content-Type': 'application/json' },
}));

describe('POST /api/practice/grade', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.findUnique.mockResolvedValue(mocks.dbUser);
        mocks.errorItem.findUnique.mockResolvedValue({ userId: 'user-1', lastPractice });
        mocks.gradeAnswer.mockResolvedValue({ correct: false, reason: '只答出一个解' });
        mocks.consumeAiQuota.mockResolvedValue(null);
    });

    it('用服务端暂存的题目和标准答案判题', async () => {
        const response = await grade({ errorItemId: 'item-1', userAnswer: ' x=2 ', language: 'zh', answerText: '客户端伪造的答案' });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ correct: false, reason: '只答出一个解' });
        expect(mocks.gradeAnswer).toHaveBeenCalledWith({
            questionText: '解方程 x² = 4', answerText: 'x = 2 或 x = -2', analysis: '开平方', userAnswer: 'x=2', language: 'zh', answerImages: [],
        });
    });

    it('允许只交图片并将图片传给 AI，返回识别文本', async () => {
        mocks.gradeAnswer.mockResolvedValue({ correct: true, reason: '完整', recognizedAnswer: 'x=±2' });
        const response = await grade({ errorItemId: 'item-1', answerImage: ANSWER_IMAGE });
        expect(response.status).toBe(200);
        expect(mocks.gradeAnswer).toHaveBeenCalledWith(expect.objectContaining({ userAnswer: '', answerImages: [ANSWER_IMAGE] }));
        expect(await response.json()).toMatchObject({ recognizedAnswer: 'x=±2' });
    });
    it.each(['data:image/svg+xml;base64,PHN2Zz4=', 'https://example.com/x.png', 'local-image:abc.png',
        'data:image/png;base64,@@@', 'data:image/png;base64,aGVsbG8=',
        `data:image/png;base64,${'A'.repeat(2200000)}`])('拒绝无效或过大手写图片 %#', async answerImage => {
        expect((await grade({ errorItemId: 'item-1', userAnswer: '有文字也不能绕过图片校验', answerImage })).status).toBe(400);
        expect(mocks.consumeAiQuota).not.toHaveBeenCalled();
        expect(mocks.gradeAnswer).not.toHaveBeenCalled();
    });

    it('路由到 AI 基类的多图顺序与传输字段一致', async () => {
        class MockProvider extends BaseAIProvider {
            protected readonly providerName = 'Test';
            complete = vi.fn<(request: CompletionRequest) => Promise<string>>()
                .mockResolvedValue('{"correct":true,"reason":"完整解答"}');
        }
        const provider = new MockProvider();
        mocks.gradeAnswer.mockImplementationOnce(input => provider.gradeAnswer(input));
        const second = `data:image/jpeg;base64,${btoa('\xff\xd8\xff2')}`;
        const third = `data:image/jpeg;base64,${btoa('\xff\xd8\xff3')}`;
        expect((await grade({ errorItemId: 'item-1', answerImage: ANSWER_IMAGE, answerImages: [second, ANSWER_IMAGE, third] })).status).toBe(200);
        expect(provider.complete).toHaveBeenCalledWith(expect.objectContaining({
            image: parseAnswerImage(ANSWER_IMAGE), additionalImages: [parseAnswerImage(second), parseAnswerImage(third)],
        }));
    });

    it('接受四张图片并保留顺序', async () => {
        const answerImages = [ANSWER_IMAGE, ...[1, 2, 3].map(value => `data:image/jpeg;base64,${btoa(`\xff\xd8\xff${value}`)}`)];
        expect((await grade({ errorItemId: 'item-1', answerImages })).status).toBe(200);
        expect(mocks.gradeAnswer).toHaveBeenCalledWith(expect.objectContaining({ answerImages }));
    });

    it('旧图片在前，与数组合并后去重', async () => {
        const second = `data:image/jpeg;base64,${btoa('\xff\xd8\xff2')}`;
        expect((await grade({ errorItemId: 'item-1', answerImage: ANSWER_IMAGE, answerImages: [second, ANSWER_IMAGE, second] })).status).toBe(200);
        expect(mocks.gradeAnswer).toHaveBeenCalledWith(expect.objectContaining({ answerImages: [ANSWER_IMAGE, second] }));
    });

    it.each([
        { answerImages: [] },
        { answerImages: [ANSWER_IMAGE, 'https://example.com/answer.jpg'] },
        { answerImages: Array(5).fill(ANSWER_IMAGE) },
        { answerImage: ANSWER_IMAGE, answerImages: [1, 2, 3, 4].map(value => `data:image/jpeg;base64,${btoa(`\xff\xd8\xff${value}`)}`) },
    ])('拒绝无效图片或合并后超限的请求 %#', async input => {
        expect((await grade({ errorItemId: 'item-1', userAnswer: '有效文字', ...input })).status).toBe(400);
        expect(mocks.consumeAiQuota).not.toHaveBeenCalled();
        expect(mocks.gradeAnswer).not.toHaveBeenCalled();
    });

    it('保留图片看不清的无法确定结果', async () => {
        mocks.gradeAnswer.mockResolvedValue({ correct: null, unreadable: true, reason: '看不清，请确认' });
        const response = await grade({ errorItemId: 'item-1', answerImages: [ANSWER_IMAGE] });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ correct: null, unreadable: true, reason: '看不清，请确认' });
    });

    it('其他页面替换题目后拒绝旧版本，不扣额度也不调用 AI', async () => {
        mocks.errorItem.findUnique.mockResolvedValue({ userId: 'user-1', lastPractice: lastPractice.replace('x² = 4', 'x² = 9') });
        const response = await grade({ errorItemId: 'item-1', userAnswer: '2' });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 'PRACTICE_CHANGED' });
        expect(mocks.consumeAiQuota).not.toHaveBeenCalled();
        expect(mocks.gradeAnswer).not.toHaveBeenCalled();
    });

    it('未提供版本的旧页面不能按最新题目静默判题', async () => {
        expect((await grade({ errorItemId: 'item-1', userAnswer: '2', practiceVersion: undefined })).status).toBe(400);
        expect(mocks.gradeAnswer).not.toHaveBeenCalled();
        expect(mocks.consumeAiQuota).not.toHaveBeenCalled();
    });

    it('将解题思路与答案一起交给 AI 核验', async () => {
        expect((await grade({ errorItemId: 'item-1', userAnswer: '2', notes: '两边开平方' })).status).toBe(200);
        expect(mocks.gradeAnswer).toHaveBeenCalledWith(expect.objectContaining({ userAnswer: '2\n\n两边开平方' }));
    });

    it('不能对他人的错题判题', async () => {
        mocks.errorItem.findUnique.mockResolvedValue({ userId: 'someone-else', lastPractice });
        expect((await grade({ errorItemId: 'item-1', userAnswer: '2' })).status).toBe(404);
        expect(mocks.gradeAnswer).not.toHaveBeenCalled();
    });

    it('没有暂存题目时返回 404', async () => {
        mocks.errorItem.findUnique.mockResolvedValue({ userId: 'user-1', lastPractice: null });
        expect((await grade({ errorItemId: 'item-1', userAnswer: '2' })).status).toBe(404);
    });

    it('答案为空时校验失败', async () => {
        expect((await grade({ errorItemId: 'item-1', userAnswer: '   ' })).status).toBe(400);
    });

    it('每日 AI 次数用完时返回 429，不调用 AI', async () => {
        mocks.consumeAiQuota.mockResolvedValue(new Response(JSON.stringify({ message: 'AI_DAILY_LIMIT_EXCEEDED' }), { status: 429 }));

        expect((await grade({ errorItemId: 'item-1', userAnswer: '2' })).status).toBe(429);
        expect(mocks.consumeAiQuota).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), 'grade');
        expect(mocks.gradeAnswer).not.toHaveBeenCalled();
    });

    it('AI 失败时返回 500，由页面改为用户自行判定', async () => {
        mocks.gradeAnswer.mockRejectedValue(new Error('AI_TIMEOUT_ERROR'));
        expect((await grade({ errorItemId: 'item-1', userAnswer: '2' })).status).toBe(500);
    });
});


describe('原题复习判题', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.findUnique.mockResolvedValue(mocks.dbUser);
        mocks.errorItem.findUnique.mockResolvedValue({ userId: 'user-1', lastPractice: null,
            questionText: '原题 x²=9', answerText: '±3', analysis: '正负两个根' });
        mocks.consumeAiQuota.mockResolvedValue(null);
        mocks.gradeAnswer.mockResolvedValue({ correct: false, reason: '少一个负根' });
    });

    it('原题支持手写图片和文字同时判题', async () => {
        expect((await grade({ mode: 'original', errorItemId: 'item-1', userAnswer: '补充说明', answerImage: ANSWER_IMAGE })).status).toBe(200);
        expect(mocks.gradeAnswer).toHaveBeenCalledWith(expect.objectContaining({ answerImages: [ANSWER_IMAGE], userAnswer: '补充说明', questionText: '原题 x²=9' }));
    });

    it('不需要变式题版本，题干、标准答案和解析均取服务端原题', async () => {
        const response = await grade({ mode: 'original', errorItemId: 'item-1', practiceVersion: undefined,
            userAnswer: ' 3 ', notes: '开平方', questionText: '伪造题干', answerText: '3', analysis: '伪造解析' });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ correct: false, reason: '少一个负根' });
        expect(mocks.gradeAnswer).toHaveBeenCalledWith({ questionText: '原题 x²=9', answerText: '±3', analysis: '正负两个根',
            userAnswer: '3\n\n开平方', language: undefined, answerImages: [] });
        expect(mocks.consumeAiQuota).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), 'grade');
    });

    it.each([null, { userId: 'other', answerText: '3' }])('拒绝不存在或他人原题：%j', async (item) => {
        mocks.errorItem.findUnique.mockResolvedValue(item);
        expect((await grade({ mode: 'original', errorItemId: 'item-1', userAnswer: '3' })).status).toBe(404);
        expect(mocks.consumeAiQuota).not.toHaveBeenCalled();
        expect(mocks.gradeAnswer).not.toHaveBeenCalled();
    });

    it('没有标准答案时返回校验失败，不消耗配额', async () => {
        mocks.errorItem.findUnique.mockResolvedValue({ userId: 'user-1', questionText: '原题', answerText: ' ' });
        expect((await grade({ mode: 'original', errorItemId: 'item-1', userAnswer: '3' })).status).toBe(400);
        expect(mocks.consumeAiQuota).not.toHaveBeenCalled();
        expect(mocks.gradeAnswer).not.toHaveBeenCalled();
    });

    it('未登录账户不能进行原题判题', async () => {
        mocks.user.findUnique.mockResolvedValue(null);
        expect((await grade({ mode: 'original', errorItemId: 'item-1', userAnswer: '3' })).status).toBe(401);
        expect(mocks.consumeAiQuota).not.toHaveBeenCalled();
        expect(mocks.gradeAnswer).not.toHaveBeenCalled();
    });

    it('原题判题同样受 AI 配额限制', async () => {
        mocks.consumeAiQuota.mockResolvedValue(new Response('{}', { status: 429 }));
        expect((await grade({ mode: 'original', errorItemId: 'item-1', userAnswer: '3' })).status).toBe(429);
        expect(mocks.gradeAnswer).not.toHaveBeenCalled();
    });

    it.each([{ mode: 'invalid' }, { mode: 'original', userAnswer: '' }, { mode: 'original', notes: 'x'.repeat(20001) }])('校验输入 %j', async (body) => {
        expect((await grade({ errorItemId: 'item-1', userAnswer: '3', ...body })).status).toBe(400);
        expect(mocks.consumeAiQuota).not.toHaveBeenCalled();
    });
});
