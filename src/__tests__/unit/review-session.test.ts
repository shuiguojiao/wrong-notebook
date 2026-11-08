import { describe, expect, it } from 'vitest';
import { completeReview, createReviewSnapshot, getReviewProgress, parseReviewLimit, savedReviewOutcome } from '@/lib/review-session';
import type { ReviewOutcome } from '@/lib/review-session';

const items = Array.from({ length: 25 }, (_, index) => ({ id: String(index), nextReviewAt: '2026-11-08T00:00:00Z' }));

describe('复习会话队列与小结', () => {
    it.each([null, '20', 'invalid', '0'])('未选择或非法题量 %s 回退 20', value => {
        expect(parseReviewLimit(value)).toBe('20');
    });
    it.each([['10', 10], ['20', 20], ['all', 25]] as const)('题量 %s 限制快照为 %s', (limit, size) => {
        expect(createReviewSnapshot(items, limit)).toHaveLength(size);
    });
    it('固定开始顺序，去重并复制，源列表变化不改变会话', () => {
        const source = items.map(item => ({ ...item }));
        const snapshot = createReviewSnapshot([...source, source[0]], 'all');
        source[0].id = 'changed';
        source.shift();
        expect(snapshot).toEqual(items);
    });
    it('依次完成，忽略重复或过期回调，不跳题', () => {
        const first = { ...items[0], result: 'correct' as const };
        const outcomes = completeReview(items, [], first);
        expect(completeReview(items, outcomes, first)).toBe(outcomes);
        expect(completeReview(items, outcomes, { ...items[2], result: 'wrong' })).toBe(outcomes);
        expect(getReviewProgress(items, outcomes)).toMatchObject({ current: items[1], completed: 1, total: 25, percent: 4 });
    });
    it('小结分别统计对错和跳过，并保留每题日期', () => {
        const outcomes: ReviewOutcome[] = [
            { ...items[0], result: 'correct', nextReviewAt: null },
            { ...items[1], result: 'wrong', nextReviewAt: '2026-11-09T00:00:00Z' },
            { ...items[2], result: 'skipped' },
        ];
        expect(getReviewProgress(items.slice(0, 3), outcomes)).toMatchObject({ correct: 1, wrong: 1, skipped: 1, current: null, percent: 100 });
        expect(outcomes[2].nextReviewAt).toBe(items[2].nextReviewAt);
    });
    it('仅使用服务端保存后返回的计划，完成全部轮次时保留 null', () => {
        expect(savedReviewOutcome('a', { result: 'correct', reviewPlan: { stage: 6, nextReviewAt: null } })).toEqual({ id: 'a', result: 'correct', nextReviewAt: null });
        expect(savedReviewOutcome('a', { result: 'wrong' })).toBeNull();
        expect(savedReviewOutcome('a', { result: 'not_attempted', reviewPlan: { stage: 0, nextReviewAt: 'date' } })).toBeNull();
    });
    it('空队列的进度合法', () => {
        expect(getReviewProgress([], [])).toMatchObject({ percent: 0, total: 0, completed: 0, current: null });
    });
});
