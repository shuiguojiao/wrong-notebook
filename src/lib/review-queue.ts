import { differenceInCalendarDays } from 'date-fns';
import { getCalendarDate, getDayRange } from '@/lib/date-time';
import { REVIEW_INTERVALS, reviewKind } from '@/lib/review-schedule';
import type { ReviewSubject } from '@/lib/review-duration';

export interface QueueItem {
    id: string;
    subjectId: string | null;
    subject?: ReviewSubject | null;
    questionType?: string | null;
    reviewStage: number;
    nextReviewAt: Date;
    estimatedSec: number;
}

const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function sortReviewQueue<T extends QueueItem>(items: readonly T[], now: Date, timeZone: string): T[] {
    const overdue = (item: T) => differenceInCalendarDays(getCalendarDate(now, timeZone), getCalendarDate(item.nextReviewAt, timeZone))
        / (REVIEW_INTERVALS[reviewKind(item)][item.reviewStage] ?? 1);
    return [...items].sort((a, b) => a.reviewStage - b.reviewStage || overdue(b) - overdue(a)
        || a.nextReviewAt.getTime() - b.nextReviewAt.getTime() || compareId(a.id, b.id));
}

/** 科目顺序取各组首次出现的顺序，组内保留优先级；遇到超额下一题立即停止。 */
export function takeReviewBudget<T extends QueueItem>(sorted: readonly T[], budgetSec: number, allowFirst: boolean, roundRobin = true): T[] {
    const groups = new Map<string, T[]>();
    for (const item of sorted) {
        const key = roundRobin ? item.subjectId ?? '' : '';
        const group = groups.get(key) ?? [];
        group.push(item);
        groups.set(key, group);
    }
    const queue: T[] = [];
    let seconds = 0;
    while (groups.size) {
        for (const [key, group] of groups) {
            const item = group.shift()!;
            if (seconds + item.estimatedSec > budgetSec && !(allowFirst && queue.length === 0)) return queue;
            queue.push(item);
            seconds += item.estimatedSec;
            if (!group.length) groups.delete(key);
        }
    }
    return queue;
}

export function hasReviewBacklog(backlogSec: number, dailyMinutes: number): boolean {
    return backlogSec > dailyMinutes * 60 * 3;
}

export function extraReviewQueue<T extends QueueItem>(due: readonly T[], future: readonly T[], now: Date, timeZone: string): T[] {
    const end = getDayRange(now, timeZone, 3).end;
    const candidates = due.length ? due : future.filter(item => item.reviewStage >= 2
        && item.nextReviewAt >= getDayRange(now, timeZone).end && item.nextReviewAt < end);
    return sortReviewQueue(candidates, now, timeZone).slice(0, 5);
}
