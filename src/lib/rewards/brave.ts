import { getDayRange } from '@/lib/date-time';
import type { MasteryStatus } from '@/lib/mastery-status';
import { REWARD_RULES } from './rules';

export interface BraveCandidate {
    id: string;
    difficultyStars: number | null;
    masteryStatus: MasteryStatus;
    nextReviewAt: Date | null;
    inTodayQueue: boolean;
}

/** 今日额度队列优先；未排入额度的到期积压不冒充未到期题。 */
export function pickBraveItem<T extends BraveCandidate>(candidates: readonly T[], now: Date, timeZone: string): T | null {
    const end = getDayRange(now, timeZone).end;
    const eligible = candidates.filter(item => (item.difficultyStars ?? 0) >= REWARD_RULES.brave.minStars
        && item.masteryStatus !== 'mastered');
    const today = eligible.filter(item => item.inTodayQueue);
    const pool = today.length ? today : eligible.filter(item => item.nextReviewAt === null || item.nextReviewAt >= end);
    return pool.sort((a, b) => (b.difficultyStars ?? 0) - (a.difficultyStars ?? 0)
        || (a.nextReviewAt?.getTime() ?? Infinity) - (b.nextReviewAt?.getTime() ?? Infinity)
        || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
}
