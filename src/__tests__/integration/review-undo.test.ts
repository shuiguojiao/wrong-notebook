import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rebuildReviewState, reviewPlanOf } from '@/lib/review-schedule';

const mocks = vi.hoisted(() => ({
    findFirst: vi.fn(), delete: vi.fn(), findItem: vi.fn(), transaction: vi.fn(), evaluate: vi.fn(),
    session: { user: { email: 'user@example.com' }, expires: '2099-01-01' } as { user: { email: string }; expires: string } | null,
}));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));
vi.mock('@/lib/mastery', () => ({ scheduleMasteryEvaluation: mocks.evaluate }));
vi.mock('@/lib/prisma', () => ({ prisma: {
    user: { findUnique: vi.fn(async () => ({ id: 'u1' })) }, $transaction: mocks.transaction,
} }));
import { DELETE } from '@/app/api/review/undo/route';

const undo = (id = 'r1') => DELETE(new Request(`http://localhost/api/review/undo?recordId=${id}`, { method: 'DELETE' }));
const originalDate = new Date('2026-11-01T00:00:00Z');
const previous = [{ result: 'wrong', createdAt: new Date('2026-11-06T00:00:00Z') }];

describe('复习结果撤销', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-08T02:00:00Z'));
        mocks.session = { user: { email: 'user@example.com' }, expires: '2099-01-01' };
        mocks.findFirst.mockReset().mockResolvedValueOnce({ id: 'r1', source: 'review', errorItemId: 'q1', createdAt: new Date(Date.now() - 3000) }).mockResolvedValue({ id: 'r1' });
        mocks.findItem.mockResolvedValue({ id: 'q1', updatedAt: originalDate, createdAt: originalDate, practiceRecords: previous });
        mocks.transaction.mockImplementation(async callback => callback({
            practiceRecord: { findMany: vi.fn(async () => []), findFirst: mocks.findFirst, delete: mocks.delete }, errorItem: { findMany: vi.fn(async () => []), findUniqueOrThrow: mocks.findItem, update: vi.fn() },
        }));
    });
    afterEach(() => vi.useRealTimers());

    it('删除最近的本人复习记录，返回删除后的原调度并重新评估掌握度', async () => {
        const response = await undo();
        expect(response.status).toBe(200);
        const body = await response.json();
        const plan = reviewPlanOf(rebuildReviewState({ id: 'q1', createdAt: originalDate }, previous, [], 'Asia/Shanghai'));
        expect(body.reviewPlan).toEqual(JSON.parse(JSON.stringify(plan)));
        expect(['2026-11-08T16:00:00.000Z', '2026-11-09T16:00:00.000Z']).toContain(body.reviewPlan.nextReviewAt);
        expect(mocks.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: 'r1', userId: 'u1', errorItem: { userId: 'u1' } } }));
        expect(mocks.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { userId: 'u1' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
        expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
        expect(mocks.evaluate).toHaveBeenCalledWith(['q1']);
        expect(mocks.transaction).toHaveBeenCalledTimes(1);
    });
    it('没有剩余记录时恢复录入日的计划', async () => {
        mocks.findItem.mockResolvedValue({ id: 'q1', updatedAt: originalDate, createdAt: originalDate, practiceRecords: [] });
        const body = await (await undo()).json();
        expect(body.reviewPlan.stage).toBe(0);
        expect(['2026-11-03T16:00:00.000Z', '2026-11-04T16:00:00.000Z']).toContain(body.reviewPlan.nextReviewAt);
    });
    it('未登录拒绝访问', async () => {
        mocks.session = null;
        expect((await undo()).status).toBe(401);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
    it.each(['', '%20', 'a'.repeat(201)])('拒绝非法记录编号 %s', async id => {
        expect((await undo(id)).status).toBe(400);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
    it('不存在、他人的记录或错题均不可删除，重复撤销也不再删除', async () => {
        mocks.findFirst.mockReset().mockResolvedValue(null);
        expect((await undo()).status).toBe(404);
        expect(mocks.delete).not.toHaveBeenCalled();
    });
    it.each(['manual', 'practice', 'exam'])('拒绝撤销 %s 来源', async source => {
        mocks.findFirst.mockReset().mockResolvedValue({ id: 'r1', source, errorItemId: 'q1', createdAt: new Date() });
        expect((await undo()).status).toBe(409);
        expect(mocks.delete).not.toHaveBeenCalled();
    });
    it.each([-1, 60001])('拒绝未来或过期记录 %s', async age => {
        mocks.findFirst.mockReset().mockResolvedValue({ id: 'r1', source: 'review', errorItemId: 'q1', createdAt: new Date(Date.now() - age) });
        expect((await undo()).status).toBe(409);
        expect(mocks.delete).not.toHaveBeenCalled();
    });
    it('后续已有新作答时不能删除旧记录', async () => {
        mocks.findFirst.mockResolvedValueOnce({ id: 'newer' });
        expect((await undo()).status).toBe(409);
        expect(mocks.delete).not.toHaveBeenCalled();
        expect(mocks.evaluate).not.toHaveBeenCalled();
    });
    it('事务失败返回错误，不触发成功后的评估', async () => {
        mocks.transaction.mockRejectedValueOnce(new Error('事务失败'));
        expect((await undo()).status).toBe(500);
        expect(mocks.evaluate).not.toHaveBeenCalled();
    });
});
