import { describe, expect, it, vi } from 'vitest';
const findMany = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { errorItem: { findMany } } }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));
import { getDueReviewSummary } from '@/lib/review-due';
describe('待复习统计', () => {
    it('复用到期筛选并统计所有科目和未分类', async () => {
        findMany.mockResolvedValueOnce([
            { id: 'old', createdAt: new Date('2026-10-01'), practiceRecords: [] },
            { id: 'old2', createdAt: new Date('2026-10-02'), practiceRecords: [] },
            { id: 'old3', createdAt: new Date('2026-10-03'), practiceRecords: [] },
            { id: 'new', createdAt: new Date('2026-11-05'), practiceRecords: [] },
        ]).mockResolvedValueOnce([{ subject: { name: '数学' } }, { subject: { name: '数学' } }, { subject: null }]);
        expect(await getDueReviewSummary('u', new Date('2026-11-05T04:00:00Z'))).toEqual({ total: 3, subjects: { '数学': 2, '未分类': 1 } });
        expect(findMany.mock.calls[1][0].where.id.in).toEqual(['old', 'old2', 'old3']);
    });
});
