import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/review-state', () => ({ backfillReviewStates: vi.fn() }));
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), records: vi.fn(async () => []), minutes: 10 }));
vi.mock('@/lib/prisma', () => {
    const db = { errorItem: { findMany: mocks.findMany }, practiceRecord: { findMany: mocks.records },
        user: { findUniqueOrThrow: async () => ({ reviewDailyMinutes: mocks.minutes }) } };
    return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));
import { getDueReviewSummary } from '@/lib/review-due';
describe('待复习统计', () => {
    it('只统计分钟队列内科目与未分类，不将积压题计入提醒', async () => {
        mocks.findMany.mockResolvedValue([
            ...['old', 'old2', 'old3', 'old4'].map((id, i) => ({ id, subjectId: i === 2 ? null : 'math', subject: i === 2 ? null : { name: '数学', subjectKey: 'math' }, reviewStage: 0, reviewWrongStreak: 0, nextReviewAt: new Date('2026-10-05'), reviewCompletedAt: null })),
        ]);
        expect(await getDueReviewSummary('u', new Date('2026-11-05T04:00:00Z'))).toEqual({ total: 3, subjects: { '数学': 2, '未分类': 1 }, estimatedMinutes: 10 });
    });
});
