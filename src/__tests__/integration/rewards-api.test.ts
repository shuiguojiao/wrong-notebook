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
import { GET as BADGES } from '@/app/api/rewards/badges/route';
import { GET as DUE } from '@/app/api/review/due/route';
import { GET as USER, PATCH as PATCH_USER } from '@/app/api/user/route';
import { confirmAttempt } from '@/lib/exam/exam-attempt';
import { getRewardSummary, settleRewards } from '@/lib/rewards/service';
import { rewardMeta, shiftDay } from '@/lib/rewards/rules';
import { formatDateTime } from '@/lib/date-time';
import type { RewardBadgesResponse, RewardSummaryResponse } from '@/types/api';

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

describe('勇者题与成就章接口', () => {
    it('summary 复用用户掌握阈值、科目标签与列表题干摘要', async () => {
        await db.subject.create({ data: { id: 'math', userId: 'reward-user', name: '数学', subjectKey: 'math', stage: 'junior_high' } });
        await db.knowledgeTag.createMany({ data: ['A', 'B', 'C', 'D'].map(name => ({ id: `tag-${name}`, userId: 'reward-user', name, subject: 'math' })) });
        await db.errorItem.update({ where: { id: 'item' }, data: { difficultyStars: 5, subjectId: 'math', masteryProbability: 0.7,
            questionText: '**题目** $x^2$ ' + '题干'.repeat(40), tags: { connect: ['A', 'B', 'C', 'D'].map(name => ({ id: `tag-${name}` })) } } });
        await db.practiceRecord.create({ data: { userId: 'reward-user', errorItemId: 'item', source: 'review', result: 'correct', createdAt: new Date(Date.now() - 86400000) } });
        expect((await summary()).brave).toBeNull();
        await db.user.update({ where: { id: 'reward-user' }, data: { masteryThreshold: 80 } });
        const brave = (await summary()).brave!;
        expect(brave).toMatchObject({ errorItemId: 'item', subjectName: '数学', subjectKey: 'math', tags: ['A', 'B', 'C'], done: false, result: null });
        expect(brave.preview).toMatch(/^题目 \$x\^2\$ /);
        expect(brave.preview.endsWith('...')).toBe(true);
    });

    it('summary 首次固定题目，并行查询不换题，次日按最新队列换题', async () => {
        await db.errorItem.update({ where: { id: 'item' }, data: { difficultyStars: 4 } });
        const first = await summary();
        expect(first.brave).toMatchObject({ errorItemId: 'item', difficultyStars: 4, preview: '1+1', done: false, result: null });
        await db.errorItem.update({ where: { id: 'remaining' }, data: { difficultyStars: 5 } });
        expect((await summary()).brave).toEqual(first.brave);
        await Promise.all([settleRewards('reward-user'), settleRewards('reward-user')]);
        const picks = await db.rewardEntry.findMany({ where: { type: 'brave_pick' } });
        expect(picks).toHaveLength(1);
        expect(picks[0]).toMatchObject({ points: 0, refKey: `day:${first.today.day}` });
        expect(rewardMeta(picks[0].meta)).toEqual({ rulesVersion: 1, errorItemId: 'item' });
        const tomorrow = new Date(Date.now() + 86400000);
        expect((await getRewardSummary('reward-user', tomorrow)).brave?.errorItemId).toBe('remaining');
        expect(await db.rewardEntry.count({ where: { type: 'brave_pick' } })).toBe(2);
    });
    it('勇者题未到期也能复习，作答后读取当日最后有效 review 结果与新章', async () => {
        const future = new Date(Date.now() + 10 * 86400000);
        await db.errorItem.update({ where: { id: 'item' }, data: { difficultyStars: 4, nextReviewAt: future } });
        expect((await summary()).brave?.errorItemId).toBe('item');
        for (const format of ['', '&format=ids', '&format=overview']) {
            const response = await DUE(req(`/api/review/due?mode=brave${format}`, undefined, 'GET'));
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.items).toHaveLength(1);
            expect(data.items[0]).toMatchObject({ id: 'item', nextReviewAt: future.toISOString() });
        }
        await save();
        const wrong = await summary();
        expect(wrong.brave).toMatchObject({ done: true, result: 'wrong' });
        expect(wrong.recentBadges).toContainEqual(expect.objectContaining({ id: 'brave-1', day: wrong.today.day }));
        expect(wrong.today.entries).toContainEqual(expect.objectContaining({ type: 'badge', points: 0, meta: { badgeId: 'brave-1' } }));
        await save({ result: 'correct' });
        const correct = await summary();
        expect(correct.brave).toMatchObject({ done: true, result: 'correct' });
        expect(correct.recentBadges).toContainEqual(expect.objectContaining({ id: 'brave-comeback' }));
        expect((await (await DUE(req('/api/review/due?mode=brave&format=ids', undefined, 'GET'))).json()).items).toHaveLength(1);
    });
    it('没有候选不写账，新增难题后再选；选中题删除后不重选', async () => {
        expect((await summary()).brave).toBeNull();
        expect(await db.rewardEntry.count({ where: { type: 'brave_pick' } })).toBe(0);
        expect((await (await DUE(req('/api/review/due?mode=brave', undefined, 'GET'))).json()).items).toEqual([]);
        await db.errorItem.update({ where: { id: 'item' }, data: { difficultyStars: 4 } });
        expect((await summary()).brave?.errorItemId).toBe('item');
        await db.errorItem.delete({ where: { id: 'item' } });
        await db.errorItem.update({ where: { id: 'remaining' }, data: { difficultyStars: 5 } });
        expect((await summary()).brave).toBeNull();
        expect((await (await DUE(req('/api/review/due?mode=brave', undefined, 'GET'))).json()).items).toEqual([]);
        expect(await db.rewardEntry.count({ where: { type: 'brave_pick' } })).toBe(1);
    });
    it('已获得成就不随撤回、删题或掌握状态回落消失', async () => {
        await db.errorItem.update({ where: { id: 'item' }, data: { difficultyStars: 4 } });
        const saved = await save();
        const first = await summary();
        expect(first.recentBadges.some(badge => badge.id === 'brave-1')).toBe(true);
        const earned = await db.rewardEntry.findMany({ where: { type: 'badge' }, orderBy: { id: 'asc' } });
        expect((await UNDO(req(`/api/review/undo?recordId=${saved.id}`, undefined, 'DELETE'))).status).toBe(200);
        await db.errorItem.update({ where: { id: 'item' }, data: { masteryProbability: 0 } });
        await db.errorItem.delete({ where: { id: 'item' } });
        await summary();
        expect(await db.rewardEntry.findMany({ where: { type: 'badge' }, orderBy: { id: 'asc' } })).toEqual(earned);
    });
    it('选题或成就写入失败会回滚同次结算的全部账目', async () => {
        await db.errorItem.update({ where: { id: 'item' }, data: { difficultyStars: 4 } });
        await db.practiceRecord.create({ data: { userId: 'reward-user', errorItemId: 'item', source: 'review', result: 'wrong' } });
        await db.$executeRaw`CREATE TRIGGER fail_badge BEFORE INSERT ON "RewardEntry" WHEN NEW.type = 'badge' BEGIN SELECT RAISE(ABORT, '模拟成就写入失败'); END`;
        try {
            await expect(settleRewards('reward-user')).rejects.toThrow();
            expect(await db.rewardEntry.count()).toBe(0);
        } finally {
            await db.$executeRaw`DROP TRIGGER fail_badge`;
        }
        expect((await summary()).brave?.errorItemId).toBe('item');
        expect(await db.rewardEntry.count({ where: { type: 'badge', refKey: 'badge:brave-1' } })).toBe(1);
    });
    it('关闭奖励不选题，也不返回已选题的复习入口', async () => {
        await db.errorItem.update({ where: { id: 'item' }, data: { difficultyStars: 5 } });
        await db.user.update({ where: { id: 'reward-user' }, data: { rewardsEnabled: false } });
        expect((await summary()).brave).toBeNull();
        expect(await db.rewardEntry.count({ where: { type: 'brave_pick' } })).toBe(0);
        await db.user.update({ where: { id: 'reward-user' }, data: { rewardsEnabled: true } });
        await summary();
        await db.user.update({ where: { id: 'reward-user' }, data: { rewardsEnabled: false } });
        expect((await summary()).brave).toBeNull();
        expect((await (await DUE(req('/api/review/due?mode=brave', undefined, 'GET'))).json()).items).toEqual([]);
    });
    it('成就接口按设计顺序返回十六项，隐藏标记、历史日期、近七日与回填过滤正确', async () => {
        const day = formatDateTime(new Date(), 'yyyy-MM-dd', 'Asia/Shanghai');
        await db.rewardEntry.createMany({ data: [
            { userId: 'reward-user', type: 'badge', refKey: 'badge:streak-1', points: 0, day: shiftDay(day, -6), meta: JSON.stringify({ rulesVersion: 1, badgeId: 'streak-1' }) },
            { userId: 'reward-user', type: 'badge', refKey: 'badge:streak-3', points: 0, day: shiftDay(day, -7), meta: JSON.stringify({ rulesVersion: 1, badgeId: 'streak-3' }) },
            { userId: 'reward-user', type: 'badge', refKey: 'badge:sticker-1', points: 0, day, meta: JSON.stringify({ rulesVersion: 1, badgeId: 'sticker-1', backfilled: true }) },
            { userId: 'reward-user', type: 'badge', refKey: 'badge:brave-1', points: 0, day, meta: JSON.stringify({ rulesVersion: 1, badgeId: 'brave-1' }) },
        ] });
        const response = await BADGES(req('/api/rewards/badges', undefined, 'GET'));
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const data: RewardBadgesResponse = await response.json();
        expect(data.badges).toHaveLength(16);
        expect(data.badges.map(badge => badge.id)).toEqual(['streak-1', 'streak-3', 'streak-7', 'streak-14', 'streak-30', 'streak-100',
            'brave-1', 'brave-10', 'brave-comeback', 'sticker-1', 'notebook-mastered', 'sticker-week-3', 'correction-10', 'early-bird', 'weekend', 'full-week']);
        expect(data.badges.filter(badge => badge.hidden).map(badge => badge.id)).toEqual(['early-bird', 'weekend', 'full-week']);
        expect(data.badges[2]).toMatchObject({ earned: false, day: null, backfilled: false });
        expect(data.badges.find(badge => badge.id === 'sticker-1')).toMatchObject({ earned: true, day, backfilled: true });
        const result = await summary();
        expect(result.badgeCount).toBe(4);
        expect(result.recentBadges.map(badge => badge.id)).toEqual(['brave-1', 'streak-1']);
    });
    it('选题、题目摘要、勇者复习与成就不能越权', async () => {
        const day = formatDateTime(new Date(), 'yyyy-MM-dd', 'Asia/Shanghai');
        await db.errorItem.create({ data: { id: 'foreign', userId: 'other', originalImageUrl: '', questionText: '他人题目', difficultyStars: 5 } });
        await db.rewardEntry.createMany({ data: [
            { userId: 'other', day, type: 'brave_pick', points: 0, refKey: `day:${day}`, meta: JSON.stringify({ rulesVersion: 1, errorItemId: 'foreign' }) },
            { userId: 'other', day, type: 'badge', points: 0, refKey: 'badge:brave-1', meta: JSON.stringify({ rulesVersion: 1, badgeId: 'brave-1' }) },
        ] });
        expect(await summary()).toMatchObject({ brave: null, badgeCount: 0, recentBadges: [] });
        const badges: RewardBadgesResponse = await (await BADGES(req('/api/rewards/badges', undefined, 'GET'))).json();
        expect(badges.badges.every(badge => !badge.earned)).toBe(true);
        // 即使当前用户导入的旧引用指向他人题目，也必须再次校验题目归属。
        await db.rewardEntry.create({ data: { userId: 'reward-user', day, type: 'brave_pick', points: 0, refKey: `day:${day}`, meta: JSON.stringify({ rulesVersion: 1, errorItemId: 'foreign' }) } });
        expect((await summary()).brave).toBeNull();
        expect((await (await DUE(req('/api/review/due?mode=brave', undefined, 'GET'))).json()).items).toEqual([]);
    });
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
