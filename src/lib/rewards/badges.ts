import { formatDateTime } from '@/lib/date-time';
import { computeLongestStreak } from '@/lib/stats/stats-streak';
import type { StudentProgress } from '@/lib/student-progress';
import { isBraveAnswer } from './brave';
import { REWARD_RULES_VERSION, rewardMeta, shiftDay } from './rules';
import type { Award, RewardRecord } from './rules';

export const REWARD_BADGES = [
    { id: 'streak-1', nameKey: 'streak1', category: 'persistence', hidden: false },
    { id: 'streak-3', nameKey: 'streak3', category: 'persistence', hidden: false },
    { id: 'streak-7', nameKey: 'streak7', category: 'persistence', hidden: false },
    { id: 'streak-14', nameKey: 'streak14', category: 'persistence', hidden: false },
    { id: 'streak-30', nameKey: 'streak30', category: 'persistence', hidden: false },
    { id: 'streak-100', nameKey: 'streak100', category: 'persistence', hidden: false },
    { id: 'brave-1', nameKey: 'brave1', category: 'courage', hidden: false },
    { id: 'brave-10', nameKey: 'brave10', category: 'courage', hidden: false },
    { id: 'brave-comeback', nameKey: 'braveComeback', category: 'courage', hidden: false },
    { id: 'sticker-1', nameKey: 'sticker1', category: 'correction', hidden: false },
    { id: 'notebook-mastered', nameKey: 'notebookMastered', category: 'correction', hidden: false },
    { id: 'sticker-week-3', nameKey: 'stickerWeek3', category: 'correction', hidden: false },
    { id: 'correction-10', nameKey: 'correction10', category: 'correction', hidden: false },
    { id: 'early-bird', nameKey: 'earlyBird', category: 'hidden', hidden: true },
    { id: 'weekend', nameKey: 'weekend', category: 'hidden', hidden: true },
    { id: 'full-week', nameKey: 'fullWeek', category: 'hidden', hidden: true },
] as const;

export type BadgeId = typeof REWARD_BADGES[number]['id'];
export type BadgeCategory = typeof REWARD_BADGES[number]['category'];
export interface BadgeRecord extends RewardRecord { difficultyStars: number | null }
export interface BadgeInput {
    records: readonly BadgeRecord[];
    existing: readonly Award[];
    completedDays: ReadonlySet<string>;
    progress: StudentProgress;
    notebooks: readonly { id: string; itemIds: readonly string[] }[];
    now: Date;
    timeZone: string;
    firstSettlement: boolean;
}

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const weekStart = (day: string) => shiftDay(day, -((weekday(day) + 6) % 7));

/** 只补缺少的章；可追溯的日期不标回填，已获得的章不随当前状态回落。 */
export function awardsForBadges(input: BadgeInput): Award[] {
    const { existing, progress, completedDays, now, timeZone, firstSettlement } = input;
    const today = formatDateTime(now, 'yyyy-MM-dd', timeZone);
    const earned = new Set(existing.filter(entry => entry.type === 'badge').map(entry => entry.refKey));
    const found = new Map<BadgeId, Award>();
    const add = (badgeId: BadgeId, day: string, backfilled = false) => {
        const refKey = `badge:${badgeId}`;
        if (earned.has(refKey) || found.has(badgeId)) return;
        found.set(badgeId, { day, type: 'badge', points: 0, refKey,
            meta: JSON.stringify({ rulesVersion: REWARD_RULES_VERSION, badgeId, earnedDay: day, ...(backfilled ? { backfilled: true } : {}) }) });
    };
    const days = [...new Set([...completedDays, ...progress.leaveDays])].filter(day => day <= today).sort();
    const longest = computeLongestStreak(new Set(days));
    let run = 0;
    for (let i = 0; i < days.length; i++) {
        run = i > 0 && shiftDay(days[i - 1], 1) === days[i] ? run + 1 : 1;
        for (const n of [1, 3, 7, 14, 30, 100] as const) {
            if (longest >= n && run === n) add(`streak-${n}`, days[i]);
        }
        if (weekday(days[i]) === 0 && completedDays.has(days[i])) {
            if (completedDays.has(shiftDay(days[i], -1))) add('weekend', days[i]);
            if (Array.from({ length: 7 }, (_, offset) => shiftDay(days[i], -offset)).every(day => completedDays.has(day))) add('full-week', days[i]);
        }
    }
    const records = input.records.filter(record => record.createdAt <= now)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const valid = records.filter(record => record.result === 'correct' || record.result === 'wrong');
    const brave = valid.filter(isBraveAnswer);
    for (const n of [1, 10] as const) {
        if (brave.length >= n) add(`brave-${n}`, formatDateTime(brave[n - 1].createdAt, 'yyyy-MM-dd', timeZone));
    }
    const wrongIds = new Set<string>();
    for (const record of brave) {
        if (!record.errorItemId) continue;
        if (record.result === 'wrong') wrongIds.add(record.errorItemId);
        else if (wrongIds.has(record.errorItemId)) add('brave-comeback', formatDateTime(record.createdAt, 'yyyy-MM-dd', timeZone));
    }
    const sortedEntries = existing.filter(entry => entry.day <= today).slice().sort((a, b) => a.day.localeCompare(b.day) || a.refKey.localeCompare(b.refKey));
    const stickers = sortedEntries.filter(entry => entry.type === 'sticker' && !rewardMeta(entry.meta).backfilled);
    if (progress.earned >= 1) {
        if (stickers[0]) add('sticker-1', stickers[0].day);
        else add('sticker-1', today, true);
    }
    if (input.notebooks.some(book => book.itemIds.length >= 5 && book.itemIds.every(id => progress.items[id]?.status === 'mastered'))) {
        add('notebook-mastered', today, firstSettlement);
    }
    const weekCounts = new Map<string, number>();
    for (const sticker of stickers) {
        const week = weekStart(sticker.day);
        const count = (weekCounts.get(week) ?? 0) + 1;
        weekCounts.set(week, count);
        if (count === 3) add('sticker-week-3', sticker.day);
    }
    const corrections = sortedEntries.filter(entry => entry.type === 'correction');
    if (corrections.length >= 10) add('correction-10', corrections[9].day);
    const reviews = new Map<string, BadgeRecord[]>();
    for (const record of valid.filter(record => record.source === 'review')) {
        const day = formatDateTime(record.createdAt, 'yyyy-MM-dd', timeZone);
        const group = reviews.get(day) ?? [];
        group.push(record);
        reviews.set(day, group);
    }
    for (const entry of sortedEntries.filter(entry => entry.type === 'done')) {
        const group = reviews.get(entry.day);
        if (group?.length && group.every(record => Number(formatDateTime(record.createdAt, 'HH', timeZone)) < 7)) add('early-bird', entry.day);
    }
    return REWARD_BADGES.flatMap(badge => found.get(badge.id) ?? []);
}
