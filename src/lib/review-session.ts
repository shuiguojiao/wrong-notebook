import type { PracticeRecordResponse, ReviewSessionItem } from '@/types/api';

export type ReviewLimit = '10' | '20' | 'all';
export type ReviewOutcome = ReviewSessionItem & { result: 'correct' | 'wrong' | 'skipped'; recordId?: string };

export function parseReviewLimit(value: string | null): ReviewLimit {
    return value === '10' || value === 'all' ? value : '20';
}

/** 固定顺序并去重，完成记录不得改变本次会话的队列。 */
export function createReviewSnapshot(items: ReviewSessionItem[], limit: ReviewLimit): ReviewSessionItem[] {
    const unique = [...new Map(items.map(item => [item.id, item])).values()];
    return (limit === 'all' ? unique : unique.slice(0, Number(limit))).map(item => ({ ...item }));
}

/** 只接纳当前题一次；重复保存回调和过期回调不推进进度。 */
export function completeReview(items: ReviewSessionItem[], outcomes: ReviewOutcome[], outcome: ReviewOutcome): ReviewOutcome[] {
    if (items[outcomes.length]?.id !== outcome.id) return outcomes;
    return [...outcomes, outcome];
}

export function getReviewProgress(items: ReviewSessionItem[], outcomes: ReviewOutcome[]) {
    const completed = outcomes.length;
    return {
        total: items.length, completed, current: items[completed] ?? null,
        percent: items.length ? completed / items.length * 100 : 0,
        correct: outcomes.filter(item => item.result === 'correct').length,
        wrong: outcomes.filter(item => item.result === 'wrong').length,
        skipped: outcomes.filter(item => item.result === 'skipped').length,
    };
}

export function savedReviewOutcome(id: string, record: PracticeRecordResponse): ReviewOutcome | null {
    if (!record.id || !record.reviewPlan || (record.result !== 'correct' && record.result !== 'wrong')) return null;
    return { id, result: record.result, nextReviewAt: record.reviewPlan.nextReviewAt, recordId: record.id };
}
