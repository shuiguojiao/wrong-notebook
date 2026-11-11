import { REWARD_BADGES } from './badges';
import type { RewardBadgeResponse, RewardEntryResponse } from '@/types/api';

/** 成就获得日可能来自历史；本次新章只按实际入账时刻判断。 */
export function sessionBadgeIds(entries: readonly RewardEntryResponse[], badges: readonly RewardBadgeResponse[], startedAt?: string): string[] {
    const start = Date.parse(startedAt ?? '');
    if (!Number.isFinite(start)) return [];
    const ids = new Set([
        ...entries.filter(entry => entry.type === 'badge' && Date.parse(entry.createdAt) > start).map(entry => entry.meta.badgeId),
        ...badges.filter(badge => badge.earned && Date.parse(badge.createdAt ?? '') > start).map(badge => badge.id),
    ]);
    return REWARD_BADGES.filter(badge => ids.has(badge.id)).map(badge => badge.id);
}
