// @vitest-environment node
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentTestDatabase } from '../helpers/agent-database';

const mocks = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined,
    session: { user: { id: 'reward-user', email: 'rewards@example.com', role: 'user' }, expires: '2099-01-01' } }));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('next-auth', () => ({ getServerSession: async () => mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));
vi.mock('@/lib/mastery', async original => ({ ...(await original<typeof import('@/lib/mastery')>()), scheduleMasteryEvaluation: vi.fn() }));
vi.mock('@/lib/question/legacy-check', () => ({ checkLegacyQuestion: vi.fn() }));

import { POST as RECORD } from '@/app/api/practice/record/route';
import { DELETE as UNDO } from '@/app/api/review/undo/route';
import { GET as SUMMARY } from '@/app/api/rewards/summary/route';
import { GET as LEDGER } from '@/app/api/rewards/ledger/route';
import { GET as USER, PATCH as PATCH_USER } from '@/app/api/user/route';
import { confirmAttempt } from '@/lib/exam/exam-attempt';
import { settleRewards } from '@/lib/rewards/service';
import { formatDateTime } from '@/lib/date-time';
import type { RewardSummaryResponse } from '@/types/api';

let database: ReturnType<typeof createAgentTestDatabase>;
let db: PrismaClient;
beforeAll(() => { database = createAgentTestDatabase(); db = database.client; mocks.db = db; }, 120000);
afterAll(async () => { await database?.dispose(); });
beforeEach(async () => {
    await db.user.deleteMany();
    mocks.session.user.email = 'rewards@example.com';
    await db.user.create({ data: { id: 'reward-user', email: mocks.session.user.email, password: 'test-only' } });
    await db.user.create({ data: { id: 'other', email: 'other@example.com', password: 'test-only' } });
    const now = new Date();
    await db.errorItem.createMany({ data: ['item', 'remaining'].map(id => ({
        id, originalImageUrl: '', userId: 'reward-user', questionText: '1+1', answerText: '2', analysis: '解析', difficultyStars: 3,
        createdAt: new Date(now.getTime() - 7 * 86400000), nextReviewAt: new Date(now.getTime() - 3600000), reviewSyncedAt: now,
    })) });
});
const req = (path: string, body?: object, method = 'POST') => new Request(`http://localhost${path}`, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });
async function save(body: object = {}) {
    const response = await RECORD(req('/api/practice/record', { source: 'review', errorItemId: 'item', result: 'wrong', ...body }));
    expect(response.status).toBe(200);
    return response.json();
}
async function summary(): Promise<RewardSummaryResponse> {
    const response = await SUMMARY(req('/api/rewards/summary', undefined, 'GET'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    return response.json();
}

describe('能量豆接口与事务', () => {
    it('保存立即返回账目，连续查询与并行结算均幂等', async () => {
        const saved = await save();
        expect(saved.rewards).toEqual([expect.objectContaining({ type: 'review', points: 1, meta: { errorItemId: 'item' } })]);
        const first = await summary();
        expect(first.balance).toBe(1);
        expect(first.today.points).toBe(1);
        expect(first.week.goalDays).toBe(4);
        expect(first.week.completedDays).toEqual([first.today.day]);
        expect(first.reviewedToday).toBe(true);
        expect(await summary()).toEqual(first);
        expect((await Promise.all([settleRewards('reward-user'), settleRewards('reward-user')])).every(result => result.created.length === 0)).toBe(true);
        const ledger = await LEDGER(req(`/api/rewards/ledger?day=${first.today.day}`, undefined, 'GET'));
        expect(ledger.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await ledger.json()).toEqual(first.today);
    });
    it('撤回在同一事务删除该条账目，再查 summary 不补发', async () => {
        const saved = await save();
        expect((await UNDO(req(`/api/review/undo?recordId=${saved.id}`, undefined, 'DELETE'))).status).toBe(200);
        expect(await db.rewardEntry.count()).toBe(0);
        expect((await summary()).balance).toBe(0);
        expect(await db.rewardEntry.count()).toBe(0);
    });
    it('首次查询回填历史，以后新增记录没有回填标记', async () => {
        await db.practiceRecord.create({ data: { id: 'history', userId: 'reward-user', errorItemId: 'item', source: 'review', result: 'wrong', createdAt: new Date(Date.now() - 86400000) } });
        await summary();
        const history = await db.rewardEntry.findFirstOrThrow({ where: { refKey: 'record:history' } });
        expect(JSON.parse(history.meta!)).toMatchObject({ backfilled: true, rulesVersion: 1 });
        const saved = await save();
        const latest = await db.rewardEntry.findFirstOrThrow({ where: { refKey: `record:${saved.id}` } });
        expect(JSON.parse(latest.meta!).backfilled).toBeUndefined();
        expect((await settleRewards('reward-user')).created).toEqual([]);
    });
    it('四星题前 3 道有勇气分，前序答错后答对另有改正奖', async () => {
        await db.errorItem.update({ where: { id: 'item' }, data: { difficultyStars: 4 } });
        const first = await save();
        expect(first.rewards.map((entry: { type: string }) => entry.type)).toEqual(['review', 'brave']);
        const second = await save({ result: 'correct' });
        expect(second.rewards.map((entry: { type: string }) => entry.type)).toEqual(['review', 'correction', 'brave']);
        await save();
        expect((await save()).rewards.map((entry: { type: string }) => entry.type)).toEqual(['review']);
        expect(await db.rewardEntry.count({ where: { type: 'brave' } })).toBe(3);
    });
    it('收工要求今日有作答与全科队列为空，同一天只给一次', async () => {
        expect((await summary()).today.entries).toEqual([]);
        await save();
        expect((await summary()).today.entries.some(entry => entry.type === 'done')).toBe(false);
        await db.errorItem.delete({ where: { id: 'remaining' } });
        const first = await summary();
        expect(first.today.entries.filter(entry => entry.type === 'done')).toHaveLength(1);
        expect(first.balance).toBe(6);
        await summary();
        expect(await db.rewardEntry.count({ where: { type: 'done' } })).toBe(1);
    });
    it('手动与无效作答无积分，无关联题的加练也按规则记账', async () => {
        expect((await save({ source: 'manual' })).rewards).toEqual([]);
        expect((await save({ source: 'practice', result: 'not_attempted' })).rewards).toEqual([]);
        expect((await save({ source: 'practice', errorItemId: undefined, difficulty: 'hard', result: 'correct' })).rewards).toEqual([expect.objectContaining({ type: 'practice', points: 3 })]);
    });
    it('查询隔离他人账目，严格校验日期与目标，偏好可读回', async () => {
        const day = formatDateTime(new Date(), 'yyyy-MM-dd', 'Asia/Shanghai');
        await db.rewardEntry.create({ data: { userId: 'other', day, type: 'review', points: 100, refKey: 'record:foreign' } });
        expect((await summary()).balance).toBe(0);
        expect((await (await LEDGER(req(`/api/rewards/ledger?day=${day}`, undefined, 'GET'))).json()).entries).toEqual([]);
        for (const day of ['2026-02-30', '2026-1-01', 'x']) expect((await LEDGER(req(`/api/rewards/ledger?day=${day}`, undefined, 'GET'))).status).toBe(400);
        expect((await PATCH_USER(req('/api/user', { weeklyGoalDays: 6 }, 'PATCH'))).status).toBe(400);
        expect((await PATCH_USER(req('/api/user', { weeklyGoalDays: 5, rewardsEnabled: false }, 'PATCH'))).status).toBe(200);
        expect(await (await USER()).json()).toMatchObject({ weeklyGoalDays: 5, rewardsEnabled: false });
        expect(await summary()).toMatchObject({ enabled: false, week: { goalDays: 5 } });
    });
    it.each(['online', 'photo', 'manual'])('试卷 %s 确认与重确认保留原账且不重发，手动不计分', async kind => {
        const paper = await db.examPaper.create({ data: { userId: 'reward-user', title: '测试', status: 'ready', scope: 'all', mode: 'original', difficulty: 'original', requestedCount: 1, subjectIds: '[]',
            questions: { create: [{ order: 0, errorItemId: 'item', sourceShortId: '123456', questionText: '题', status: 'ready' }] } }, include: { questions: true } });
        const attempt = await db.examAttempt.create({ data: { userId: 'reward-user', paperId: paper.id, kind, status: 'reviewing',
            answers: { create: [{ examQuestionId: paper.questions[0].id, finalResult: 'wrong' }] } } });
        await confirmAttempt(paper.id, 'reward-user', attempt.id);
        const first = await db.rewardEntry.findMany({ where: { type: 'exam' } });
        expect(first).toHaveLength(kind === 'manual' ? 0 : 1);
        await confirmAttempt(paper.id, 'reward-user', attempt.id);
        expect(await db.rewardEntry.findMany({ where: { type: 'exam' } })).toEqual(first);
        await summary();
        expect(await db.rewardEntry.count({ where: { type: 'exam' } })).toBe(first.length);
    });
    it('记账失败时作答与调度一并回滚，重试可以正常保存', async () => {
        const before = await db.errorItem.findUniqueOrThrow({ where: { id: 'item' } });
        // 用临时库触发器让事务客户端真实失败，验证回滚边界。
        await db.$executeRaw`CREATE TRIGGER fail_reward BEFORE INSERT ON "RewardEntry" BEGIN SELECT RAISE(ABORT, '模拟写入失败'); END`;
        const response = await RECORD(req('/api/practice/record', { source: 'review', errorItemId: 'item', result: 'wrong' }));
        await db.$executeRaw`DROP TRIGGER fail_reward`;
        expect(response.status).toBe(500);
        expect(await db.practiceRecord.count()).toBe(0);
        expect(await db.rewardEntry.count()).toBe(0);
        expect((await db.errorItem.findUniqueOrThrow({ where: { id: 'item' } })).nextReviewAt).toEqual(before.nextReviewAt);
        expect((await save()).rewards).toHaveLength(1);
    });
    it('删题与普通删记录保留账目，删用户级联清理', async () => {
        await save();
        await db.practiceRecord.deleteMany({ where: { userId: 'reward-user' } });
        await db.errorItem.delete({ where: { id: 'item' } });
        expect((await summary()).balance).toBe(1);
        await db.user.delete({ where: { id: 'reward-user' } });
        expect(await db.rewardEntry.count()).toBe(0);
    });
});
