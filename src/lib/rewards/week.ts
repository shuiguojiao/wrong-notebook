import { formatDateTime } from '@/lib/date-time';
import { isBraveAnswer } from './brave';
import type { BadgeRecord } from './badges';
import { countsForDay, rewardQuestionPreview } from './reporting';
import { rewardMeta, shiftDay } from './rules';
import type { Award } from './rules';
import type { RewardWeekResponse } from '@/types/api';

export interface WeekItem {
    questionText: string | null;
    ocrText: string | null;
    subjectName: string | null;
}

function stickerName(entry: Award): string[] {
    const name = rewardMeta(entry.meta).stickerName;
    if (typeof name === 'string') return [name];
    try {
        const key: unknown = JSON.parse(entry.refKey.slice('sticker:'.length));
        return Array.isArray(key) && typeof key[2] === 'string' ? [key[2]] : [];
    } catch { return []; }
}

export function summarizeRewardWeek(input: {
    start: string; today: string; timeZone: string; goalDays: number; completedDays: readonly string[];
    records: readonly BadgeRecord[]; entries: readonly Award[]; items: ReadonlyMap<string, WeekItem>;
}): RewardWeekResponse {
    const { start, today, timeZone, goalDays, items } = input;
    const end = shiftDay(start, 6);
    const inWeek = (day: string) => day >= start && day <= end && day <= today;
    const entries = input.entries.filter(entry => inWeek(entry.day));
    const records = input.records.filter(record => inWeek(formatDateTime(record.createdAt, 'yyyy-MM-dd', timeZone))
        && record.source !== 'duplicate_import' && (record.result === 'correct' || record.result === 'wrong'));
    const bravest = records.filter(record => ['review', 'exam'].includes(record.source) && record.errorItemId && items.has(record.errorItemId))
        .sort((a, b) => (b.difficultyStars ?? 3) - (a.difficultyStars ?? 3) || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0];
    const item = bravest?.errorItemId ? items.get(bravest.errorItemId) : undefined;
    return { start, end, reviewDays: new Set(input.completedDays.filter(inWeek)).size, goalDays,
        goalReached: entries.some(entry => entry.type === 'weekly' && entry.refKey === `week:${start}`),
        answered: records.filter(record => record.source === 'review').length,
        corrections: entries.filter(entry => entry.type === 'correction').length, braveAnswers: records.filter(isBraveAnswer).length,
        beans: entries.filter(countsForDay).reduce((sum, entry) => sum + entry.points, 0),
        badges: entries.filter(entry => entry.type === 'badge' && !rewardMeta(entry.meta).backfilled).flatMap(entry => rewardMeta(entry.meta).badgeId ?? []),
        stickers: entries.filter(entry => entry.type === 'sticker' && !rewardMeta(entry.meta).backfilled).flatMap(stickerName),
        funStickers: entries.filter(entry => entry.type === 'blindbox').flatMap(entry => rewardMeta(entry.meta).stickerId ?? []),
        bravest: bravest && item ? { errorItemId: bravest.errorItemId!, difficultyStars: bravest.difficultyStars ?? 3,
            result: bravest.result as 'correct' | 'wrong', preview: rewardQuestionPreview(item), subjectName: item.subjectName,
            day: formatDateTime(bravest.createdAt, 'yyyy-MM-dd', timeZone) } : null,
        // 手账只展示复习、改正和勇者题；这几项都为 0 的周（例如只做了举一反三）按空周处理，不显示全零的卡。
        empty: !records.some(record => record.source === 'review' || isBraveAnswer(record)) && !entries.some(entry => entry.type === 'correction') };
}
