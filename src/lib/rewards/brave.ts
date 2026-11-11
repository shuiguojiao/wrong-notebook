import type { MasteryStatus } from '@/lib/mastery-status';
import { REWARD_RULES } from './rules';

export interface BraveCandidate {
    id: string;
    difficultyStars: number | null;
    masteryStatus: MasteryStatus;
    nextReviewAt: Date | null;
    inTodayQueue: boolean;
}

/** 今日额度队列优先；其次是其余未掌握的难题，排不进今日额度的到期积压按下次复习日期排在最前。 */
export function pickBraveItem<T extends BraveCandidate>(candidates: readonly T[]): T | null {
    const eligible = candidates.filter(item => (item.difficultyStars ?? 0) >= REWARD_RULES.brave.minStars
        && item.masteryStatus !== 'mastered');
    const today = eligible.filter(item => item.inTodayQueue);
    const pool = today.length ? today : eligible;
    return pool.sort((a, b) => (b.difficultyStars ?? 0) - (a.difficultyStars ?? 0)
        || (a.nextReviewAt?.getTime() ?? Infinity) - (b.nextReviewAt?.getTime() ?? Infinity)
        || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
}
