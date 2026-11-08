/**
 * 今日待复习 API 集成测试
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    errorItem: { findMany: vi.fn() }, backfill: vi.fn(),
    session: { user: { id: 'user-1', email: 'user@example.com' }, expires: '2099-01-01' } as { user: { id: string; email: string }; expires: string } | null,
}));

vi.mock('@/lib/prisma', () => ({ prisma: { errorItem: mocks.errorItem, user: { findUnique: vi.fn(async () => ({ id: 'user-1', masteryThreshold: 50 })) } } }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(() => Promise.resolve(mocks.session)) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/review-state', () => ({ backfillReviewStates: mocks.backfill }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));

import { GET } from '@/app/api/review/due/route';

const get = (query = '') => GET(new Request(`http://localhost/api/review/due${query}`));

const candidates = [
    { id: 'old', reviewStage: 0, reviewWrongStreak: 1, reviewCompletedAt: null, nextReviewAt: new Date('2026-09-10T16:00:00Z') },
    { id: 'new', reviewStage: 0, reviewWrongStreak: 0, reviewCompletedAt: null, nextReviewAt: new Date('2026-10-18T16:00:00Z') },
];

describe('GET /api/review/due', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ toFake: ['Date'] });
        // 北京时间 2026-10-20 12:00
        vi.setSystemTime(new Date('2026-10-20T04:00:00Z'));
        mocks.session = { user: { id: 'user-1', email: 'user@example.com' }, expires: '2099-01-01' };
        mocks.errorItem.findMany.mockImplementation(async (args: { where: { id?: { in: string[] } } }) => {
            if (!args.where.id) return candidates;
            return args.where.id.in.map((id) => ({ id, questionText: '**题干** $x^2$', ocrText: 'OCR', masteryProbability: null, subjectId: 'math', subject: { name: '数学' }, tags: [], _count: { practiceRecords: id === 'new' ? 0 : 1 } }));
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('只返回到期的错题，最早到期的在前，并附带复习计划', async () => {
        const response = await get();
        expect(response.status).toBe(200);
        const data = await response.json();

        expect(mocks.backfill).toHaveBeenCalledWith({ userId: 'user-1' }, true, 'Asia/Shanghai');
        expect(data.total).toBe(2);
        expect(data.items.map((item: { id: string }) => item.id)).toEqual(['old', 'new']);
        expect(data.items[0]).toMatchObject({ reviewStage: 0, masteryStatus: 'reviewing', nextReviewAt: '2026-09-10T16:00:00.000Z' });
        expect(data.items[1]).toMatchObject({ reviewStage: 0, masteryStatus: 'new' });
        expect(mocks.errorItem.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { userId: 'user-1', reviewCompletedAt: null, nextReviewAt: { lt: new Date('2026-10-20T16:00:00Z') } } }));
    });

    it('按错题本筛选并分页', async () => {
        const response = await get('?subjectId=math&page=2&pageSize=1');
        const data = await response.json();

        expect(mocks.errorItem.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { userId: 'user-1', subjectId: 'math', reviewCompletedAt: null, nextReviewAt: { lt: new Date('2026-10-20T16:00:00Z') } } }));
        expect(data).toMatchObject({ total: 2, page: 2, pageSize: 1, totalPages: 2 });
        expect(data.items.map((item: { id: string }) => item.id)).toEqual(['new']);
    });

    it('ID 快照按顺序批量获取简短题干，不逐题读取详情', async () => {
        const response = await get('?format=ids&limit=10&subjectId=math');
        expect(await response.json()).toEqual({ items: [
            { id: 'old', nextReviewAt: '2026-09-10T16:00:00.000Z', questionPreview: '题干 x^2', subjectId: 'math', subjectName: '数学' },
            { id: 'new', nextReviewAt: '2026-10-18T16:00:00.000Z', questionPreview: '题干 x^2', subjectId: 'math', subjectName: '数学' },
        ] });
        expect(mocks.errorItem.findMany).toHaveBeenCalledTimes(2);
        expect(mocks.errorItem.findMany).toHaveBeenNthCalledWith(2, { where: { userId: 'user-1', id: { in: ['old', 'new'] } }, select: { id: true, questionText: true, ocrText: true, subjectId: true, subject: { select: { name: true } } } });
    });

    it('首页概览返回全部轻量题干与科目，不受默认 20 题限制', async () => {
        mocks.errorItem.findMany.mockImplementation(async (args: { where: { id?: { in: string[] } } }) => {
            if (!args.where.id) return Array.from({ length: 25 }, (_, i) => ({ id: String(i), reviewStage: 0, reviewWrongStreak: 0, reviewCompletedAt: null, nextReviewAt: new Date('2026-01-01') }));
            return args.where.id.in.map(id => ({ id, questionText: '题干', subjectId: 'math', subject: { name: '数学' } }));
        });
        const data = await (await get('?format=overview')).json();
        expect(data.items).toHaveLength(25);
        expect(data.items[0]).toMatchObject({ subjectId: 'math', subjectName: '数学', questionPreview: '题干' });
        expect(data.items[0]).not.toHaveProperty('answerText');
        expect(mocks.errorItem.findMany).toHaveBeenCalledTimes(2);
    });

    it.each([['', 20], ['&limit=10', 10], ['&limit=20', 20], ['&limit=all', 25]])('快照默认 20 题且支持 10/20/全部 %s', async (limit, count) => {
        mocks.errorItem.findMany.mockResolvedValue(Array.from({ length: 25 }, (_, index) => ({
            id: String(index), reviewStage: 0, reviewWrongStreak: 0, reviewCompletedAt: null, nextReviewAt: new Date('2026-01-01'),
        })));
        const response = await get('?format=ids' + limit);
        expect((await response.json()).items).toHaveLength(count);
    });

    it.each(['?format=other', '?format=ids&limit=0', '?format=ids&limit=21'])('拒绝非法快照参数 %s', async (query) => {
        expect((await get(query)).status).toBe(400);
        expect(mocks.errorItem.findMany).not.toHaveBeenCalled();
    });

    it('未登录时返回 401', async () => {
        mocks.session = null;
        const response = await get();
        expect(response.status).toBe(401);
    });

    it('page 或 pageSize 为非数字时返回 400', async () => {
        for (const query of ['?page=abc', '?pageSize=xyz', '?page=-1', '?pageSize=0']) {
            const response = await get(query);
            expect(response.status).toBe(400);
        }
    });
});
