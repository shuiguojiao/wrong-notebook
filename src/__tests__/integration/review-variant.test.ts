// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createAgentTestDatabase } from '../helpers/agent-database';

vi.unmock('@/lib/ai-consent-store');

const mocks = vi.hoisted(() => ({
    db: undefined as PrismaClient | undefined,
    config: { aiDailyLimit: 0, aiMonthlyTokenLimit: 0 },
    configured: vi.fn(),
    generate: vi.fn(),
    grade: vi.fn(),
    evaluate: vi.fn(),
    schedule: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: 'variant@example.com' }, expires: '2099-01-01' }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai', getAppConfig: () => mocks.config }));
vi.mock('@/lib/ai', () => ({
    isAIServiceConfigured: mocks.configured,
    getAIService: () => ({ generateSimilarQuestion: mocks.generate, gradeAnswer: mocks.grade, evaluateMastery: mocks.evaluate }),
}));
vi.mock('@/lib/mastery', async original => ({ ...(await original<typeof import('@/lib/mastery')>()), scheduleMasteryEvaluation: mocks.schedule }));

import { GET as DUE } from '@/app/api/review/due/route';
import { DELETE as UNDO } from '@/app/api/review/undo/route';
import { GET as PRACTICE, POST as GENERATE } from '@/app/api/practice/generate/route';
import { POST as GRADE } from '@/app/api/practice/grade/route';
import { POST as SAVE } from '@/app/api/practice/record/route';
import { PATCH as SETTINGS } from '@/app/api/user/route';
import { evaluateErrorItemMastery } from '@/lib/mastery';
import { getPracticeHistory, getPracticeRecord } from '@/lib/practice-history';
import { listBackgroundTasks } from '@/lib/background-tasks';

const now = new Date();
const variant = { questionText: '变式题干', answerText: '变式答案', analysis: '变式解析' };
const post = (body: object) => new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
const due = async (query = 'format=ids') => (await DUE(new Request(`http://localhost/api/review/due?${query}`))).json();
const generate = (errorItemId = 'late') => GENERATE(post({ errorItemId, mode: 'variant_review', difficulty: 'easy', language: 'zh' }));

let database: ReturnType<typeof createAgentTestDatabase>;
let db: PrismaClient;
beforeAll(() => { database = createAgentTestDatabase(); db = database.client; mocks.db = db; }, 120000);
afterAll(async () => database.dispose());
beforeEach(async () => {
    mocks.config = { aiDailyLimit: 0, aiMonthlyTokenLimit: 0 };
    mocks.configured.mockReset().mockReturnValue(true);
    mocks.generate.mockReset().mockImplementation(async () => ({ ...variant }));
    mocks.grade.mockReset().mockResolvedValue({ correct: false, reason: '缺少步骤' });
    mocks.evaluate.mockReset().mockResolvedValue({ probability: 0.65, reason: '测试评估' });
    mocks.schedule.mockClear();
    await db.user.deleteMany();
    await db.user.create({ data: { id: 'u', email: 'variant@example.com', password: 'test-only', aiDataConsentAt: now } });
    await db.subject.createMany({ data: [
        { id: 'math', name: '数学', subjectKey: 'math', userId: 'u' },
        { id: 'english', name: '英语', subjectKey: 'english', userId: 'u' },
    ] });
    await db.errorItem.createMany({ data: [
        { id: 'late', answerText: '原题答案', reviewStage: 2 },
        { id: 'early', answerText: '原题答案', reviewStage: 1 },
        { id: 'no-answer', answerText: ' ', reviewStage: 2 },
        { id: 'memory', subjectId: 'english', answerText: '原题答案', reviewStage: 2 },
    ].map(item => ({
        userId: 'u', subjectId: 'math', difficultyStars: 4, originalImageUrl: '', questionText: '原题题干',
        knowledgePoints: '["方程"]', reviewSyncedAt: now, nextReviewAt: now, ...item,
    })) });
});

describe('变式复习接口', () => {
    it('会话快照仅开启适合的题，概览和勇者入口仅安排原题，选题不扣额度', async () => {
        expect(await db.user.findUniqueOrThrow({ where: { id: 'u' } })).toMatchObject({ reviewVariantsEnabled: true });
        const queue = await due();
        expect(queue.items).toHaveLength(4);
        expect(queue.items.filter((item: { useVariant?: boolean }) => item.useVariant).map((item: { id: string }) => item.id)).toEqual(['late']);
        expect(queue.items.find((item: { id: string }) => item.id === 'late')).not.toHaveProperty('answerText');
        expect((await due('format=overview')).items.find((item: { id: string }) => item.id === 'late')).not.toHaveProperty('useVariant');
        const day = queue.dayKey.slice(queue.dayKey.lastIndexOf(':') + 1);
        await db.rewardEntry.create({ data: { userId: 'u', day, type: 'brave_pick', points: 0, refKey: `day:${day}`, meta: JSON.stringify({ errorItemId: 'late' }) } });
        const brave = await due('format=ids&mode=brave');
        expect(brave.items).toMatchObject([{ id: 'late' }]);
        expect(brave.items[0]).not.toHaveProperty('useVariant');
        const preference = await SETTINGS(post({ reviewVariantsEnabled: false }));
        expect(await preference.json()).toMatchObject({ reviewVariantsEnabled: false });
        expect((await due()).items.every((item: { useVariant?: boolean }) => !item.useVariant)).toBe(true);
        expect(await db.aiUsage.count()).toBe(0);
    });

    it.each(['未授权', '渠道不可用', '日限', '月限'])('%s 时快照直接安排原题', async reason => {
        if (reason === '未授权') await db.user.update({ where: { id: 'u' }, data: { aiDataConsentAt: null } });
        if (reason === '渠道不可用') mocks.configured.mockReturnValue(false);
        if (reason === '日限' || reason === '月限') {
            mocks.config = { aiDailyLimit: reason === '日限' ? 1 : 0, aiMonthlyTokenLimit: reason === '月限' ? 10 : 0 };
            await db.aiUsage.create({ data: { userId: 'u', kind: 'practice', inputTokens: 10 } });
        }
        expect((await due()).items.find((item: { id: string }) => item.id === 'late')).not.toHaveProperty('useVariant');
        expect(await db.aiUsage.count()).toBe(reason.endsWith('限') ? 1 : 0);
    });

    it('生成、判题、确认、历史和撤销使用同一变式快照', async () => {
        const regularPractice = await GENERATE(post({ errorItemId: 'late', difficulty: 'easy' }));
        const savedPractice = await regularPractice.json();
        const response = await generate();
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toMatchObject({ ...variant, difficulty: 'hard', variantToken: expect.any(String) });
        expect(mocks.generate).toHaveBeenLastCalledWith('原题题干', ['方程'], 'zh', 'hard', null, null);
        expect(await (await PRACTICE(new Request('http://localhost?errorItemId=late'))).json()).toMatchObject({
            practice: { difficulty: 'easy', practiceVersion: savedPractice.practiceVersion },
        });
        const base = { errorItemId: 'late', variantToken: data.variantToken };
        expect((await GRADE(post({ ...base, mode: 'variant_review', userAnswer: '我的答案' }))).status).toBe(200);
        expect(mocks.grade).toHaveBeenCalledWith(expect.objectContaining({ ...variant, userAnswer: '我的答案' }));
        expect((await GRADE(post({ ...base, errorItemId: 'early', mode: 'variant_review', userAnswer: '我的答案' }))).status).toBe(404);
        const submitted = { ...base, source: 'variant_review', result: 'correct', confidence: 'sure', durationSec: 91,
            userAnswer: '我的答案', gradeReason: '作答完整', questionText: '不应信任此题干' };
        expect((await SAVE(post({ ...submitted, variantToken: data.variantToken + 'a' }))).status).toBe(400);
        const saved = await SAVE(post(submitted));
        expect(saved.status).toBe(200);
        const record = await saved.json();
        expect(record).toMatchObject({ ...variant, source: 'variant_review', errorItemId: 'late', difficulty: 'hard', confidence: 'sure',
            durationSec: 91, wrongAnswerText: '我的答案', gradeReason: '作答完整', reviewPlan: { stage: 2 } });
        expect(record.rewards).toMatchObject([{ type: 'review', points: 1 }, { type: 'correction', points: 2 }]);
        expect(mocks.schedule).toHaveBeenCalledWith(['late']);
        await evaluateErrorItemMastery('late');
        expect(mocks.evaluate).toHaveBeenCalledWith(expect.objectContaining({
            history: [expect.objectContaining({ source: 'variant_review', difficulty: null, result: 'correct' })],
        }));
        expect(await due()).toMatchObject({ todayReviewed: 1, todayDurationSec: 91 });
        const history = await getPracticeHistory('u', { days: 1, subject: null });
        expect(history.days[0]).toMatchObject({ summary: { reviewDurationSec: 91 },
            records: [{ source: 'variant_review', preview: variant.questionText }] });
        expect(await getPracticeRecord('u', record.id)).toMatchObject({ ...variant, userAnswer: '我的答案', gradeReason: '作答完整' });
        expect((await UNDO(new Request(`http://localhost?recordId=${record.id}`, { method: 'DELETE' }))).status).toBe(200);
        expect(await due()).toMatchObject({ todayReviewed: 0, todayDurationSec: 0 });
        expect(await db.rewardEntry.count({ where: { refKey: `record:${record.id}` } })).toBe(0);
        const wrong = await SAVE(post({ ...submitted, result: 'wrong', mistakeLesson: '下次补足步骤' }));
        expect((await wrong.json()).confidence).toBeNull();
        expect(await db.errorItem.findUniqueOrThrow({ where: { id: 'late' } })).toMatchObject({ mistakeLesson: '下次补足步骤', reviewWrongStreak: 1 });
    });

    it('会话开始后额度用完，复用的生成接口拒绝调用模型', async () => {
        expect((await due()).items).toContainEqual(expect.objectContaining({ id: 'late', useVariant: true }));
        mocks.config.aiDailyLimit = 1;
        await db.aiUsage.create({ data: { userId: 'u', kind: 'practice' } });
        expect((await generate()).status).toBe(429);
        expect(mocks.generate).not.toHaveBeenCalled();
    });

    it('生成失败不在后台任务面板留下报错', async () => {
        mocks.generate.mockRejectedValueOnce(new Error('Model unavailable'));
        expect((await generate()).status).toBe(500);
        expect(listBackgroundTasks('u').some(task => task.kind === 'variant_review')).toBe(false);
    });
});
