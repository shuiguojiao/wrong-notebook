import "server-only";

import { randomInt } from 'node:crypto';
import { FUN_STICKERS, normalizeFunSetId } from './fun-stickers';
import { REWARD_RULES, REWARD_RULES_VERSION, funRewardMeta, shiftDay } from './rules';
import type { Award } from './rules';

export function rewardWeekStart(day: string): string {
    return shiftDay(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
}

/** 只评估本周；抽签函数注入后可固定结果，默认使用系统安全随机数。 */
export function settleWeekly(realDays: ReadonlySet<string>, goalDays: number, existing: readonly Award[], today: string,
    random: (max: number) => number = randomInt): Award[] {
    const weekStart = rewardWeekStart(today);
    const count = [...realDays].filter(day => day >= weekStart && day <= today).length;
    if (count < goalDays) return [];
    const awards: Award[] = [];
    const add = (type: string, points: number, refKey: string, meta: object = {}) => {
        const normalizedRef = (key: string) => type === 'fun_set' && key.startsWith('set:')
            ? `set:${normalizeFunSetId(key.slice(4))}` : key;
        if (!existing.some(entry => entry.type === type && normalizedRef(entry.refKey) === refKey)) awards.push({ type, points, refKey, day: today,
            meta: JSON.stringify({ rulesVersion: REWARD_RULES_VERSION, ...meta }) });
    };
    add('weekly', REWARD_RULES.weekly.points, `week:${weekStart}`);
    if (existing.some(entry => entry.type === 'blindbox' && entry.refKey === `box:${weekStart}`)) return awards;
    const owned = new Set(existing.filter(entry => entry.type === 'blindbox').flatMap(entry => funRewardMeta(entry.meta).stickerId ?? []));
    const pool = FUN_STICKERS.filter(sticker => !owned.has(sticker.id));
    const sticker = pool.length ? pool[random(pool.length)] : null;
    if (sticker) owned.add(sticker.id);
    const setCompleted = sticker && FUN_STICKERS.filter(candidate => candidate.setId === sticker.setId).every(candidate => owned.has(candidate.id))
        ? sticker.setId : null;
    add('blindbox', sticker ? 0 : REWARD_RULES.blindboxAllOwned.points, `box:${weekStart}`, { weekStart, stickerId: sticker?.id ?? null, setCompleted });
    if (setCompleted) add('fun_set', REWARD_RULES.funSet.points, `set:${setCompleted}`);
    return awards;
}
