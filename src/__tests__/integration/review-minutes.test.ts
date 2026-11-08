// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createAgentTestDatabase } from '../helpers/agent-database';

const mocks = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: 'minutes@example.com' }, expires: '2099-01-01' }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));
vi.mock('@/lib/mastery', async original => ({ ...(await original<typeof import('@/lib/mastery')>()), scheduleMasteryEvaluation: vi.fn() }));
import { GET as DUE } from '@/app/api/review/due/route';
import { POST as SAVE } from '@/app/api/practice/record/route';
import { PATCH as SETTINGS } from '@/app/api/user/route';
import { getDueReviewSummary, getReviewQueue } from '@/lib/review-due';
import { backfillReviewStates, syncReviewState } from '@/lib/review-state';
import { getDayRange } from '@/lib/date-time';
import { rebuildReviewTimeline, reviewKind, REVIEW_WINDOWS, REVIEW_INTERVALS } from '@/lib/review-schedule';

let database: ReturnType<typeof createAgentTestDatabase>;
let db: PrismaClient;
const now = new Date('2026-11-08T04:00:00Z');
const zone = 'Asia/Shanghai';
const day = (offset: number) => getDayRange(now, zone, offset).start;
const request = (body: object) => new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
const create = (id: string, subjectId = 'math', offset = -1, reviewStage = 0) => db.errorItem.create({ data: {
    id, userId: 'u', subjectId, originalImageUrl: '', createdAt: day(-40), reviewSyncedAt: now,
    nextReviewAt: day(offset), reviewStage,
} });

beforeAll(() => { database = createAgentTestDatabase(); db = database.client; mocks.db = db; });
afterAll(async () => database.dispose());
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    await db.user.deleteMany();
    await db.user.create({ data: { id: 'u', email: 'minutes@example.com', password: 'test-only', reviewDailyMinutes: 10 } });
    await db.subject.create({ data: { id: 'math', name: '数学', subjectKey: 'math', userId: 'u' } });
    await db.subject.create({ data: { id: 'english', name: '英语', subjectKey: 'english', userId: 'u' } });
});
afterEach(() => vi.useRealTimers());

describe('每日分钟额度（正式迁移后的真实 SQLite）', () => {
    it('首页、会话与提醒共享额度队列和分钟数，不暴露未排入的积压题', async () => {
        for (const id of ['a', 'b', 'c', 'd']) await create(id);
        const overview = await (await DUE(new Request('http://localhost/api/review/due?format=overview'))).json();
        const session = await (await DUE(new Request('http://localhost/api/review/due?format=ids'))).json();
        expect(overview.items.map((item: { id: string }) => item.id)).toEqual(['a', 'b']);
        expect(overview).toMatchObject({ dailyMinutes: 10, remainingMinutes: 10, consumedMinutes: 0, estimatedMinutes: 8 });
        expect(session.items).toEqual(overview.items);
        expect(await getDueReviewSummary('u', now, zone)).toEqual({ total: 2, subjects: { '数学': 2 }, estimatedMinutes: 8 });
    });
    it('按今天的估计值扣减，实际用时只用于完成态；应用时区昨天与非复习记录不扣减', async () => {
        await create('done', 'math', 10); await create('a'); await create('b');
        await db.practiceRecord.create({ data: { userId: 'u', errorItemId: 'done', source: 'review', result: 'correct', durationSec: 1200, createdAt: now } });
        await db.practiceRecord.create({ data: { userId: 'u', errorItemId: 'done', source: 'review', result: 'correct', durationSec: 100, createdAt: new Date(day(0).getTime() - 1) } });
        await db.practiceRecord.create({ data: { userId: 'u', errorItemId: 'done', source: 'manual', result: 'correct', durationSec: 100, createdAt: now } });
        const queue = await getReviewQueue('u', undefined, 'today', now, zone);
        expect(queue).toMatchObject({ consumedMinutes: 4, remainingMinutes: 6, todayDurationSec: 1200, todayReviewed: 1, estimatedMinutes: 4 });
        expect(queue.entries.map(item => item.id)).toEqual(['a']);
    });
    it('科目筛选只扣该科额度，科目轮流且组内按轮次与逾期优先', async () => {
        await create('a'); await create('b'); await create('e', 'english'); await create('done', 'english', 10);
        await db.practiceRecord.create({ data: { userId: 'u', errorItemId: 'done', source: 'review', result: 'correct', createdAt: now } });
        expect((await getReviewQueue('u')).entries.map(q => q.id)).toEqual(['e', 'a', 'b']);
        expect(await getReviewQueue('u', 'math')).toMatchObject({ consumedMinutes: 0, remainingMinutes: 10, estimatedMinutes: 8 });
        expect(await getReviewQueue('u', 'english')).toMatchObject({ consumedMinutes: 1, remainingMinutes: 9, estimatedMinutes: 1 });
    });
    it('校准值只读该用户每科的复习有效时长，第一题允许超额', async () => {
        await create('a'); await create('b'); await create('done', 'math', 10);
        for (let i = 0; i < 5; i++) await db.practiceRecord.create({ data: { userId: 'u', errorItemId: 'done', source: 'review', result: 'correct', durationSec: 1200, createdAt: day(-i - 1) } });
        const queue = await getReviewQueue('u');
        expect(queue.entries.map(q => q.id)).toEqual(['a']); expect(queue.estimatedMinutes).toBe(20);
    });
    it('复习才写用时，返回与记录一致；不合法时长拒绝且不写库', async () => {
        await create('a');
        const response = await SAVE(request({ errorItemId: 'a', result: 'correct', source: 'review', durationSec: 123, confidence: 'sure' }));
        expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ durationSec: 123, reviewPlan: { stage: 2 } });
        expect(await db.practiceRecord.findFirstOrThrow()).toMatchObject({ source: 'review', durationSec: 123 });
        expect((await SAVE(request({ errorItemId: 'a', result: 'wrong', source: 'manual', durationSec: 300 }))).status).toBe(200);
        expect(await db.practiceRecord.findFirstOrThrow({ where: { source: 'manual' } })).toMatchObject({ durationSec: null });
        for (const durationSec of [-1, 1.5, '60', 2147483648]) expect((await SAVE(request({ errorItemId: 'a', result: 'wrong', source: 'review', durationSec }))).status).toBe(400);
        expect(await db.practiceRecord.count()).toBe(2);
    });
    it.each([10, 30, 180])('个人额度 %i 持久化并在接口返回', async reviewDailyMinutes => {
        const response = await SETTINGS(request({ reviewDailyMinutes })); expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ reviewDailyMinutes });
        expect(await db.user.findUniqueOrThrow({ where: { id: 'u' } })).toMatchObject({ reviewDailyMinutes });
    });
    it.each([0, 9, 11, 181, 30.5, '30', null])('拒绝非法额度 %s', async reviewDailyMinutes => {
        expect((await SETTINGS(request({ reviewDailyMinutes }))).status).toBe(400);
        expect((await db.user.findUniqueOrThrow({ where: { id: 'u' } })).reviewDailyMinutes).toBe(10);
    });
    it('明天估计分钟数封顶额度，已复习且额度不足显示完成态信息', async () => {
        for (const id of ['a', 'b', 'c']) await create(id, 'math', 1);
        await create('done', 'math', 10);
        for (let i = 0; i < 3; i++) await db.practiceRecord.create({ data: { userId: 'u', errorItemId: 'done', source: 'review', result: 'wrong', createdAt: now, durationSec: 120 } });
        expect(await getReviewQueue('u')).toMatchObject({ entries: [], remainingMinutes: 0, todayDurationSec: 360, todayReviewed: 3, tomorrowMinutes: 10 });
    });
    it('再来一组不受当天已用额度限制，积压优先，没积压则提前三天且至少第二轮', async () => {
        await create('due'); await create('future', 'math', 2, 2); await create('young', 'math', 1, 1); await create('late', 'math', 4, 2);
        expect((await getReviewQueue('u', undefined, 'extra')).entries.map(q => q.id)).toEqual(['due']);
        await db.errorItem.delete({ where: { id: 'due' } });
        expect((await getReviewQueue('u', undefined, 'extra')).entries.map(q => q.id)).toEqual(['future']);
    });
    it('最后一步在当前负载最少的日期安排，历史回填幂等并排除自身旧日期', async () => {
        const item = await create('a');
        const record = await db.practiceRecord.create({ data: { userId: 'u', errorItemId: 'a', source: 'review', result: 'correct', confidence: 'unsure', createdAt: now } });
        const input = { ...item, subject: { name: '数学', subjectKey: 'math' } };
        const replay = rebuildReviewTimeline(input, [record], [], zone);
        const [min, max] = REVIEW_WINDOWS[REVIEW_INTERVALS[reviewKind(input)][replay.state.reviewStage]];
        for (let offset = min; offset < max; offset++) await create(`load-${offset}`, 'math', offset);
        const state = await db.$transaction(tx => syncReviewState(tx, 'a'));
        expect(state.nextReviewAt).toEqual(day(max));
        expect(await db.$transaction(tx => syncReviewState(tx, 'a'))).toEqual(state);
        await backfillReviewStates({ userId: 'u' }, false);
        const first = await db.errorItem.findMany({ select: { id: true, nextReviewAt: true }, orderBy: { id: 'asc' } });
        await backfillReviewStates({ userId: 'u' }, false);
        expect(await db.errorItem.findMany({ select: { id: true, nextReviewAt: true }, orderBy: { id: 'asc' } })).toEqual(first);
    });
});
