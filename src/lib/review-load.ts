import { getDayRange, shiftCalendarDate } from '@/lib/date-time';
import { REVIEW_INTERVALS, REVIEW_WINDOWS, reviewHash } from '@/lib/review-schedule';
import type { ReviewKind } from '@/lib/review-schedule';

export interface ReviewLoad { id: string; nextReviewAt: Date; estimatedSec: number }

/** 最少负载候选中用同一哈希打破平局；不把本题旧安排计入负载。 */
export function selectReviewDate(id: string, stage: number, kind: ReviewKind, anchor: Date, loads: readonly ReviewLoad[], timeZone: string): Date {
    const [min, max] = REVIEW_WINDOWS[REVIEW_INTERVALS[kind][stage]];
    const days = Array.from({ length: max - min + 1 }, (_, index) => getDayRange(shiftCalendarDate(anchor, timeZone, min + index), timeZone));
    const totals = days.map(day => loads.reduce((sum, item) => sum + (item.id !== id && item.nextReviewAt >= day.start && item.nextReviewAt < day.end ? item.estimatedSec : 0), 0));
    const lowest = Math.min(...totals);
    const candidates = days.filter((_, index) => totals[index] === lowest);
    return candidates[reviewHash(id, stage) % candidates.length].start;
}
