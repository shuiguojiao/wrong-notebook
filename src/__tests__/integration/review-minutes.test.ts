// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createAgentTestDatabase } from '../helpers/agent-database';

const mocks = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined, timeZone: 'Asia/Shanghai' }));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: 'minutes@example.com' }, expires: '2099-01-01' }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => mocks.timeZone }));
vi.mock('@/lib/mastery', async original => ({ ...(await original<typeof import('@/lib/mastery')>()), scheduleMasteryEvaluation: vi.fn() }));
import { GET as NOTEBOOKS } from '@/app/api/notebooks/route';
import { GET as LIST } from '@/app/api/error-items/list/route';
import { GET as SHORT } from '@/app/api/error-items/short/[shortId]/route';
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
    mocks.timeZone = zone;
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
        expect(session.estimatedMinutes).toBe(overview.estimatedMinutes);
        const subject = await (await DUE(new Request('http://localhost/api/review/due?format=ids&subjectId=math'))).json();
        expect(subject.items).toEqual(overview.items);
        expect(subject.estimatedMinutes).toBe(overview.estimatedMinutes);
        expect(await getDueReviewSummary('u', now, zone)).toEqual({ total: 2, subjects: { '数学': 2 }, estimatedMinutes: 8 });
    });
    it('封面、列表今天标签与本内会话均按同一全局额度队列计数，未掌握与积压另计', async () => {
        for (const id of ['a', 'b', 'c', 'd']) await create(id);
        for (const id of ['e', 'f', 'g']) await create(id, 'english');
        await create('future', 'math', 2);
        await create('mastered', 'math', 5);
        await db.errorItem.update({ where: { id: 'mastered' }, data: { masteryProbability: 0.9 } });
        await db.practiceRecord.create({ data: { userId: 'u', errorItemId: 'mastered', result: 'correct', source: 'manual', createdAt: day(-1) } });
        const overview = await (await DUE(new Request('http://localhost/api/review/due?format=overview'))).json();
        const response = await NOTEBOOKS();
        expect(response.status).toBe(200);
        const notebooks = await response.json();
        for (const id of ['math', 'english']) {
            const todayIds = overview.items.filter((item: { subjectId: string }) => item.subjectId === id).map((item: { id: string }) => item.id);
            const notebook = notebooks.find((item: { id: string }) => item.id === id);
            const list = await (await LIST(new Request(`http://localhost/api/error-items/list?subjectId=${id}&pageSize=100`))).json();
            const session = await (await DUE(new Request(`http://localhost/api/review/due?format=ids&subjectId=${id}`))).json();
            expect(notebook.progress.dueToday).toBe(todayIds.length);
            expect(list.dueTodayCount).toBe(todayIds.length);
            expect(list.items.filter((item: { isDueToday: boolean }) => item.isDueToday).map((item: { id: string }) => item.id).sort()).toEqual([...todayIds].sort());
            expect(session.items.map((item: { id: string }) => item.id)).toEqual(todayIds);
            expect(notebook.progress.dueToday).toBeLessThan(notebook.progress.unmastered);
            const pending = await (await LIST(new Request(`http://localhost/api/error-items/list?subjectId=${id}&mastery=unmastered`))).json();
            expect(pending.total).toBe(notebook.progress.unmastered);
            expect(notebook.progress.mastered + notebook.progress.unmastered).toBe(notebook._count.errorItems);
        }
        expect(notebooks.find((item: { id: string }) => item.id === 'math').progress.mastered).toBe(1);
    });
    it('应用日内到期题与今天页队列一致，额度外同日题和明日题不误标', async () => {
        vi.setSystemTime(new Date('2026-11-10T15:59:59Z'));
        const start = new Date('2026-11-09T16:00:00Z');
        const end = new Date('2026-11-10T16:00:00Z');
        for (const [id, nextReviewAt] of [
            ['a', start],
            ['b', new Date(end.getTime() - 1)],
            ['c', new Date(end.getTime() - 1)],
            ['tomorrow', end],
        ] as const) {
            await create(id);
            await db.errorItem.update({ where: { id }, data: { nextReviewAt } });
        }
        const read = async () => {
            const overview = await (await DUE(new Request('http://localhost/api/review/due?format=overview'))).json();
            const list = await (await LIST(new Request('http://localhost/api/error-items/list?subjectId=math'))).json();
            const ids = overview.items.map((item: { id: string }) => item.id);
            expect(list.items.filter((item: { isDueToday: boolean }) => item.isDueToday).map((item: { id: string }) => item.id).sort()).toEqual([...ids].sort());
            expect(list.dueTodayCount).toBe(ids.length);
            return { ids, list };
        };
        const before = await read();
        expect(before.ids).toEqual(['a', 'b']);
        for (const id of before.ids) expect(before.list.items.find((item: { id: string }) => item.id === id)).toMatchObject({ isDueToday: true, reviewState: 'today' });
        expect(before.list.items.find((item: { id: string }) => item.id === 'c')).toMatchObject({ isDueToday: false, reviewState: 'queued' });
        expect(before.list.items.find((item: { id: string }) => item.id === 'tomorrow')).toMatchObject({ isDueToday: false, reviewState: 'later' });
        await db.user.update({ where: { id: 'u' }, data: { reviewDailyMinutes: 30 } });
        vi.setSystemTime(end);
        const after = await read();
        expect(after.ids).toEqual(['a', 'b', 'c', 'tomorrow']);
        expect(after.list.items.every((item: { reviewState: string }) => item.reviewState === 'today')).toBe(true);
    });
    it.each([
        ['Asia/Shanghai', '2026-11-10T00:00:00Z', '2026-11-10T16:00:00Z'],
        ['America/New_York', '2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z'],
    ])('额度用完时以 %s 应用日结束区分逾期、当天到期与未来，兼容夏令时', async (timeZone, current, end) => {
        mocks.timeZone = timeZone;
        const instant = new Date(current);
        vi.setSystemTime(instant);
        for (const id of ['overdue', 'today', 'future', 'completed']) await create(id);
        await db.errorItem.update({ where: { id: 'overdue' }, data: { nextReviewAt: getDayRange(instant, timeZone, -1).start } });
        await db.errorItem.update({ where: { id: 'today' }, data: { nextReviewAt: new Date(new Date(end).getTime() - 1) } });
        await db.errorItem.update({ where: { id: 'future' }, data: { nextReviewAt: new Date(end) } });
        await db.errorItem.update({ where: { id: 'completed' }, data: { nextReviewAt: null, reviewCompletedAt: instant } });
        await db.practiceRecord.createMany({ data: Array.from({ length: 3 }, () => ({ userId: 'u', errorItemId: 'completed', result: 'correct', source: 'review', createdAt: instant })) });
        const response = await LIST(new Request('http://localhost/api/error-items/list?subjectId=math'));
        expect(response.status).toBe(200);
        const list = await response.json();
        expect(list.dueTodayCount).toBe(0);
        for (const id of ['overdue', 'today']) expect(list.items.find((item: { id: string }) => item.id === id)).toMatchObject({ isDueToday: false, reviewState: 'queued' });
        for (const id of ['future', 'completed']) expect(list.items.find((item: { id: string }) => item.id === id)).toMatchObject({ isDueToday: false, reviewState: 'later' });
    });
    it('搜索短编号与精确定位隔离用户，并保留搜索和筛选计数', async () => {
        await create('a'); await create('b');
        await db.errorItem.update({ where: { id: 'a' }, data: { shortId: 'AbC234', questionText: '方程题', knowledgePoints: '["方程"]' } });
        await db.user.create({ data: { id: 'other', email: 'other@example.com', password: 'test-only' } });
        await db.errorItem.create({ data: { id: 'private', userId: 'other', shortId: 'XyZ789', questionText: '方程题', originalImageUrl: '' } });
        const filtered = await (await LIST(new Request('http://localhost/api/error-items/list?subjectId=math&query=AbC234&mastery=unmastered'))).json();
        expect(filtered.total).toBe(1);
        expect(filtered.items[0].id).toBe('a');
        const knowledge = await (await LIST(new Request(`http://localhost/api/error-items/list?query=${encodeURIComponent('方程')}&mastery=unmastered`))).json();
        expect(knowledge.total).toBe(1);
        expect((await SHORT(undefined, { params: Promise.resolve({ shortId: 'AbC234' }) })).status).toBe(200);
        expect((await SHORT(undefined, { params: Promise.resolve({ shortId: 'XyZ789' }) })).status).toBe(404);
        expect((await (await LIST(new Request('http://localhost/api/error-items/list?query=XyZ789'))).json()).total).toBe(0);
    });
    it('完成科目摘要使用同日复习记录，重复与刷新不重复计题，撤销后不再显示', async () => {
        await create('done', 'english', 10); await create('pending', 'math');
        await db.practiceRecord.createMany({ data: [
            { userId: 'u', errorItemId: 'done', source: 'review', result: 'correct', createdAt: now },
            { userId: 'u', errorItemId: 'done', source: 'review', result: 'correct', createdAt: now },
            { userId: 'u', errorItemId: 'pending', source: 'manual', result: 'correct', createdAt: now },
            { userId: 'u', errorItemId: 'pending', source: 'review', result: 'correct', createdAt: new Date(day(0).getTime() - 1) },
        ] });
        const read = async () => (await DUE(new Request('http://localhost/api/review/due?format=overview'))).json();
        const first = await read();
        expect(first.items.map((item: { id: string }) => item.id)).toEqual(['pending']);
        expect(first.reviewedSubjects).toEqual([{ subjectId: 'english', subjectName: '英语', count: 1 }]);
        expect(first.todayReviewed).toBe(1);
        expect((await read()).todayReviewed).toBe(1);
        expect((await read()).reviewedSubjects).toEqual(first.reviewedSubjects);
        await db.practiceRecord.deleteMany({ where: { errorItemId: 'done' } });
        expect((await read()).reviewedSubjects).toEqual([]);
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
        expect(await getReviewQueue('u')).toMatchObject({ entries: [], remainingMinutes: 0, todayDurationSec: 360, todayReviewed: 1, tomorrowMinutes: 10 });
    });
    it('再来 5 题不受当天已用额度限制，积压优先，没积压则提前三天且至少第二轮', async () => {
        await create('due'); await create('future', 'math', 2, 2); await create('young', 'math', 1, 1); await create('late', 'math', 4, 2);
        expect((await getReviewQueue('u', undefined, 'extra')).entries.map(q => q.id)).toEqual(['due']);
        await db.errorItem.delete({ where: { id: 'due' } });
        expect((await getReviewQueue('u', undefined, 'extra')).entries.map(q => q.id)).toEqual(['future']);
    });
    it('加练至多五道，当天已保存题不重复进入，重复读取不新增记录，撤销后可重新进入', async () => {
        for (let i = 0; i < 8; i++) await create(String(i), 'english');
        const read = async () => (await DUE(new Request('http://localhost/api/review/due?format=ids&mode=extra'))).json();
        expect((await read()).items).toHaveLength(5);
        await db.practiceRecord.createMany({ data: [0, 0, 1, 2, 3, 4].map(id => ({ userId: 'u', errorItemId: String(id), source: 'review', result: 'wrong', createdAt: now })) });
        const first = await read();
        expect(first.items.map((item: { id: string }) => item.id)).toEqual(['5', '6', '7']);
        expect(first.todayReviewed).toBe(5);
        expect((await read()).items).toEqual(first.items);
        expect(await db.practiceRecord.count()).toBe(6);
        await db.practiceRecord.deleteMany({ where: { errorItemId: '0' } });
        expect((await read()).items.map((item: { id: string }) => item.id)).toEqual(['0', '5', '6', '7']);
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
