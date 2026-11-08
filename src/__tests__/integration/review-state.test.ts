// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createAgentTestDatabase } from '../helpers/agent-database';

const mocks = vi.hoisted(() => ({
    db: undefined as PrismaClient | undefined, evaluate: vi.fn(), authenticated: true, failSync: false,
}));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('next-auth', () => ({ getServerSession: async () => mocks.authenticated ? { user: { email: 'review@example.com' }, expires: '2099-01-01' } : null }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));
vi.mock('@/lib/mastery', async original => ({ ...(await original<typeof import('@/lib/mastery')>()), scheduleMasteryEvaluation: mocks.evaluate }));
import { POST as RECORD } from '@/app/api/practice/record/route';
import { DELETE as REMOVE } from '@/app/api/practice/record/[id]/route';
import { DELETE as UNDO } from '@/app/api/review/undo/route';
import { GET as DUE } from '@/app/api/review/due/route';
import { GET as GET_REVIEW, PUT as ADJUST } from '@/app/api/error-items/[id]/review/route';
import { DELETE as CLEAR } from '@/app/api/stats/practice/clear/route';
import { backfillReviewStates, syncReviewState } from '@/lib/review-state';
import { rebuildReviewState } from '@/lib/review-schedule';
import { getDueReviewSummary } from '@/lib/review-due';
import { recordDuplicateQuestion } from '@/lib/question/question-deduplication';
import { getAgentErrorItem } from '@/lib/agent/queries';
import { updateAgentErrorRecord, deleteAgentErrorRecord } from '@/lib/agent/records';
import { PUT as UPDATE_ITEM } from '@/app/api/error-items/[id]/route';
import { PUT as UPDATE_NOTEBOOK } from '@/app/api/notebooks/[id]/route';
import { recordExamResults } from '@/lib/exam/exam';

let database: ReturnType<typeof createAgentTestDatabase>;
let db: PrismaClient;
const ctx = (id = 'q1') => ({ params: Promise.resolve({ id }) });
const request = (body: object) => new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
const save = (result: string, confidence?: string, source = 'review') => RECORD(request({ errorItemId: 'q1', source, result, confidence, takenAt: new Date().toISOString() }));
const adjust = (action: string, id = 'q1') => ADJUST(request({ action }), ctx(id));
const item = () => db.errorItem.findUniqueOrThrow({ where: { id: 'q1' } });

beforeAll(() => {
    database = createAgentTestDatabase(); db = database.client; mocks.db = db;
    db.$use(async (params, next) => {
        if (mocks.failSync && params.model === 'ErrorItem' && params.action === 'update') throw new Error('测试同步失败');
        return next(params);
    });
});
afterAll(async () => database.dispose());
beforeEach(async () => {
    mocks.authenticated = true; mocks.failSync = false;
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
    await db.user.deleteMany();
    await db.user.create({ data: { id: 'u1', email: 'review@example.com', password: 'test-only' } });
    await db.user.create({ data: { id: 'u2', email: 'other@example.com', password: 'test-only' } });
    await db.subject.create({ data: { id: 'math', name: '数学', subjectKey: 'math', userId: 'u1' } });
    await db.errorItem.create({ data: { id: 'q1', shortId: 'abc234', userId: 'u1', subjectId: 'math', originalImageUrl: '', questionText: '求解方程', createdAt: new Date('2026-10-01') } });
    await db.errorItem.create({ data: { id: 'other', userId: 'u2', originalImageUrl: '', createdAt: new Date('2026-10-01') } });
});
afterEach(() => vi.useRealTimers());

describe('复习重放与事务（正式迁移后的真实 SQLite）', () => {
    it('复习写入 confidence 和缓存同事务，返回更新后的轮次与到期日', async () => {
        const response = await save('correct', 'sure'); expect(response.status).toBe(200);
        const result = await response.json(); expect(result.confidence).toBe('sure'); expect(result.reviewPlan.stage).toBe(2);
        const value = await item(); expect(value.reviewStage).toBe(2); expect(value.reviewSyncedAt).not.toBeNull();
        const records = await db.practiceRecord.findMany({ where: { errorItemId: 'q1' } });
        const expected = rebuildReviewState({ ...value, subject: { name: '数学', subjectKey: 'math' } }, records, [], 'Asia/Shanghai');
        expect(value).toMatchObject(expected); expect(result.reviewPlan.nextReviewAt).toBe(expected.nextReviewAt?.toISOString());
        expect((await db.errorItem.findUniqueOrThrow({ where: { id: 'other' } })).reviewSyncedAt).toBeNull();
    });
    it.each(['manual', 'practice'])('%s 作答也同步，缺少 confidence 按不太确定', async source => {
        expect((await save('correct', undefined, source)).status).toBe(200); expect((await item()).reviewStage).toBe(1);
    });
    it('同步失败回滚刚写入的作答，不留下半更新状态', async () => {
        mocks.failSync = true; expect((await save('correct', 'sure')).status).toBe(500); mocks.failSync = false;
        expect(await db.practiceRecord.count()).toBe(0); expect((await item()).reviewSyncedAt).toBeNull();
    });
    it('普通删除和复习撤销均删除实际记录并重新计算计划', async () => {
        const first = await (await save('correct', 'sure')).json();
        expect((await UNDO(new Request(`http://localhost/api/review/undo?recordId=${first.id}`, { method: 'DELETE' }))).status).toBe(200);
        expect(await db.practiceRecord.count()).toBe(0); expect((await item()).reviewStage).toBe(0);
        const next = await (await save('correct')).json();
        expect((await REMOVE(new Request('http://localhost'), ctx(next.id))).status).toBe(200);
        expect(await db.practiceRecord.count()).toBe(0); expect((await item()).reviewStage).toBe(0);
        expect((await REMOVE(new Request('http://localhost'), ctx(next.id))).status).toBe(404);
    });
    it('到期接口和提醒懒迁移旧题，新题未到期、完成题及他人题不混入', async () => {
        await db.errorItem.create({ data: { id: 'fresh', userId: 'u1', originalImageUrl: '', createdAt: new Date() } });
        await db.errorItem.create({ data: { id: 'completed', userId: 'u1', originalImageUrl: '', createdAt: new Date('2026-10-01'), practiceRecords: { create: Array.from({ length: 4 }, (_, n) => ({ userId: 'u1', result: 'correct', createdAt: new Date(Date.UTC(2026, 9, n + 2)) })) } } });
        const data = await (await DUE(new Request('http://localhost/api/review/due?format=ids'))).json();
        expect(data.items.map((row: { id: string }) => row.id)).toEqual(['q1']);
        expect((await item()).reviewSyncedAt).not.toBeNull();
        expect((await db.errorItem.findUniqueOrThrow({ where: { id: 'completed' } })).reviewCompletedAt).not.toBeNull();
        expect((await db.errorItem.findUniqueOrThrow({ where: { id: 'other' } })).reviewSyncedAt).toBeNull();
        expect(await getDueReviewSummary('u1', new Date(), 'Asia/Shanghai')).toEqual({ total: 1, subjects: { '数学': 1 }, estimatedMinutes: 4 });
        const cached = await item(); await getDueReviewSummary('u1', new Date(), 'Asia/Shanghai'); expect((await item()).reviewSyncedAt).toEqual(cached.reviewSyncedAt);
    });
    it('手动完成与重新加入不写作答、不改掌握度；之后新作答从最后一轮继续', async () => {
        const original = await item(); expect((await GET_REVIEW(new Request('http://localhost'), ctx())).status).toBe(200);
        expect((await adjust('completed')).status).toBe(200); expect((await item()).reviewStage).toBe(4);
        expect((await item()).nextReviewAt).toBeNull(); expect(await db.practiceRecord.count()).toBe(0); expect(mocks.evaluate).not.toHaveBeenCalled();
        vi.setSystemTime(new Date('2026-11-08T12:00:01Z')); await save('wrong'); expect((await item()).reviewStage).toBe(1);
        await adjust('restart'); const state = await item(); expect(state.reviewStage).toBe(0); expect(state.reviewWrongStreak).toBe(0);
        expect(state.nextReviewAt).toEqual(new Date('2026-11-08T16:00:00Z')); expect(state.masteryProbability).toBe(original.masteryProbability);
        expect(await db.practiceRecord.count()).toBe(1);
    });
    it('手动接口拒绝他人记录、非法动作与未登录请求', async () => {
        expect((await adjust('completed', 'other')).status).toBe(404); expect((await adjust('invalid')).status).toBe(400);
        mocks.authenticated = false; expect((await adjust('completed')).status).toBe(401);
        expect((await db.errorItem.findUniqueOrThrow({ where: { id: 'other' } })).reviewOverride).toBeNull();
    });
    it('清空统计会同步受影响题，保留手动调整且不波及他人', async () => {
        await save('correct', 'sure'); await adjust('completed');
        expect((await CLEAR(new Request('http://localhost', { method: 'DELETE' }))).status).toBe(200);
        expect(await db.practiceRecord.count()).toBe(0); expect((await item()).reviewStage).toBe(4); expect((await item()).reviewCompletedAt).not.toBeNull();
        expect((await db.errorItem.findUniqueOrThrow({ where: { id: 'other' } })).reviewSyncedAt).toBeNull();
    });
    it('全量回填幂等，重新同步保持调度和业务修订时间', async () => {
        await save('correct', 'sure'); const before = await item();
        expect(await backfillReviewStates({}, false)).toBe(2);
        const after = await item(); expect(after.nextReviewAt).toEqual(before.nextReviewAt); expect(after.updatedAt).toEqual(before.updatedAt);
        expect(await backfillReviewStates({}, false)).toBe(2); expect((await item()).reviewStage).toBe(2);
    });
    it('重复导入的做错记录与缓存同事务更新', async () => {
        await save('correct', 'sure');
        await db.$transaction(tx => recordDuplicateQuestion(tx, 'u1', { id: 'q1', similarity: 1 }, { questionText: '求解方程', wrongAnswerText: '错答' }));
        expect((await item()).reviewStage).toBe(0); expect((await item()).reviewWrongStreak).toBe(1);
    });
    it('试卷录入也在事务内统一重放原题', async () => {
        await db.examPaper.create({ data: { id: 'p1', userId: 'u1', title: '测试', status: 'ready', scope: 'all', difficulty: 'medium', requestedCount: 1, subjectIds: '[]', questions: { create: { id: 'eq1', order: 0, errorItemId: 'q1', sourceShortId: 'abc234' } } } });
        expect(await recordExamResults('p1', 'u1', new Date(), [{ questionId: 'eq1', result: 'correct' }])).toEqual(['q1']);
        expect((await item()).reviewStage).toBe(1);
    });
    it('超过一批的旧题全部初始化，第二次懒迁移不重复写入', async () => {
        await db.errorItem.createMany({ data: Array.from({ length: 105 }, (_, index) => ({ id: `batch-${String(index).padStart(3, '0')}`, userId: 'u1', originalImageUrl: '', createdAt: new Date('2026-10-01') })) });
        expect(await backfillReviewStates({ userId: 'u1' })).toBe(106);
        expect(await db.errorItem.count({ where: { userId: 'u1', reviewSyncedAt: { not: null } } })).toBe(106);
        expect(await backfillReviewStates({ userId: 'u1' })).toBe(0);
    });
    it('Agent 纠正和删除导入记录同步复习；懒迁移不会改变内容修订', async () => {
        const user = await db.user.findUniqueOrThrow({ where: { id: 'u1' } });
        const before = await getAgentErrorItem(user, { id: 'q1' }, 'http://localhost');
        await backfillReviewStates({ userId: 'u1' });
        const cached = await getAgentErrorItem(user, { id: 'q1' }, 'http://localhost');
        expect(cached.item.revision).toBe(before.item.revision);
        const duplicate = await db.$transaction(tx => recordDuplicateQuestion(tx, 'u1', { id: 'q1', similarity: 1 }, { questionText: '求解方程' }));
        const current = await getAgentErrorItem(user, { id: 'q1' }, 'http://localhost');
        const changed = await updateAgentErrorRecord(user, { id: 'q1', recordId: duplicate.practiceRecordId, expectedRevision: current.item.revision, patch: { result: 'correct' } }, 'http://localhost');
        expect((await item()).reviewStage).toBe(1);
        await deleteAgentErrorRecord(user, { id: 'q1', recordId: duplicate.practiceRecordId, expectedRevision: changed.item.revision, confirm: true }, 'http://localhost');
        expect((await item()).reviewStage).toBe(0); expect((await item()).reviewWrongStreak).toBe(0); expect(await db.practiceRecord.count()).toBe(0);
    });
    it('更换科目或题型使缓存失效，详情读取按当前分类重放', async () => {
        await save('correct', 'sure'); const method = await item();
        await db.subject.create({ data: { id: 'english', name: '英语', subjectKey: 'english', userId: 'u1' } });
        expect((await UPDATE_ITEM(request({ subjectId: 'english' }), ctx())).status).toBe(200);
        expect((await item()).reviewSyncedAt).toBeNull();
        const state = await (await GET_REVIEW(new Request('http://localhost'), ctx())).json();
        expect(state.totalRounds).toBe(5); expect(state.stage).toBe(2);
        expect((await item()).nextReviewAt!.getTime()).toBeLessThan(method.nextReviewAt!.getTime());
    });
    it('旧错题本按名称推断科目，改名后重建其题目的缓存', async () => {
        await db.subject.update({ where: { id: 'math' }, data: { subjectKey: null } });
        await db.$transaction(tx => syncReviewState(tx, 'q1'));
        expect((await UPDATE_NOTEBOOK(request({ name: '英语' }), ctx('math'))).status).toBe(200);
        expect((await item()).reviewSyncedAt).toBeNull();
        const state = await (await GET_REVIEW(new Request('http://localhost'), ctx())).json();
        expect(state.totalRounds).toBe(5); expect(state.nextReviewAt).toBe('2026-10-01T16:00:00.000Z');
    });
    it('错误的 confidence 拒绝写入，未作答记录不推进安排', async () => {
        expect((await save('correct', 'guess')).status).toBe(400); expect(await db.practiceRecord.count()).toBe(0);
        await db.$transaction(tx => syncReviewState(tx, 'q1')); const before = await item();
        await save('not_attempted', undefined, 'manual'); expect((await item()).nextReviewAt).toEqual(before.nextReviewAt); expect((await item()).reviewStage).toBe(0);
    });
});
