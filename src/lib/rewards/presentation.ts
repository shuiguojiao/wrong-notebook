import { REWARD_RULES } from '@/lib/rewards/rules';
import type { ReviewOutcome } from '@/lib/review-session';
import type { RewardEntryResponse } from '@/types/api';

export function sessionRewardTotals(outcomes: readonly ReviewOutcome[]) {
    const totals = { review: 0, correction: 0, brave: 0 };
    for (const outcome of outcomes) {
        if (outcome.result === 'skipped') continue;
        for (const entry of outcome.rewards ?? []) {
            if (['review', 'practice', 'exam'].includes(entry.type)) totals.review += entry.points;
            else if (entry.type === 'correction' || entry.type === 'brave') totals[entry.type] += entry.points;
        }
    }
    return totals;
}

/** 优先用账目元数据里的天数；旧账目没有时按同版规则表的点数反查。 */
export function streakDays(entry: RewardEntryResponse): string {
    if (entry.meta.streakDays) return String(entry.meta.streakDays);
    return Object.entries(REWARD_RULES.streak).find(([, points]) => points === entry.points)?.[0] ?? '–';
}

export function sessionSettlements(entries: readonly RewardEntryResponse[], startedAt?: string) {
    if (!startedAt) return [];
    return entries.filter(entry => ['done', 'mastered', 'sticker', 'streak', 'weekly', 'fun_set', 'blindbox'].includes(entry.type)
        && new Date(entry.createdAt).getTime() > new Date(startedAt).getTime());
}
