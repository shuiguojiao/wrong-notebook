import { formatDateTime, getDayRange } from '@/lib/date-time';
import { masteryStatusOf } from '@/lib/mastery-status';
import type { MasteryStatus } from '@/lib/mastery-status';
import { computeCurrentStreak } from '@/lib/stats/stats-streak';

export interface ProgressRecord {
    id: string;
    source: string;
    result: string | null;
    createdAt: Date;
}

export interface ProgressItem {
    id: string;
    subjectId: string | null;
    subjectName: string | null;
    subjectKey: string | null;
    tags: { name: string; tagSet: string }[];
    masteryProbability: number | null;
    masteryEvaluatedAt: Date | null;
    records: ProgressRecord[];
}

export interface StudentSticker {
    key: string;
    name: string;
    tagSet: string;
    subjectId: string | null;
    subjectName: string | null;
    subjectKey: string | null;
    state: 'earned' | 'improving' | 'missing';
    itemIds: string[];
    total: number;
    remaining: number;
    earnedDay: string | null;
}

export interface StudentProgress {
    stickers: StudentSticker[];
    earned: number;
    weeklyNew: StudentSticker[];
    streak: number;
    reviewedToday: boolean;
    day: string;
    items: Record<string, { status: MasteryStatus; pending: boolean }>;
}

const validAnswer = (record: ProgressRecord) => record.source !== 'duplicate_import'
    && (record.result === 'correct' || record.result === 'wrong');

/** 只读当前仍存在的记录，撤销、删题与重标会自然改变派生结果。 */
export function computeStudentProgress(items: readonly ProgressItem[], threshold: number, now: Date, timeZone: string): StudentProgress {
    const day = formatDateTime(now, 'yyyy-MM-dd', timeZone);
    const recentStart = getDayRange(now, timeZone, -29).start;
    const days = new Set<string>();
    const states: StudentProgress['items'] = {};
    const groups = new Map<string, { sticker: StudentSticker; results: string[]; earnedDays: (string | null)[] }>();
    for (const item of items) {
        const records = item.records.filter(record => record.createdAt <= now);
        const valid = records.filter(validAnswer);
        const status = masteryStatusOf(valid.length, item.masteryProbability, threshold);
        const latest = records.reduce<Date | null>((date, record) => record.result !== null && (!date || record.createdAt > date) ? record.createdAt : date, null);
        const pending = latest !== null && (!item.masteryEvaluatedAt || item.masteryEvaluatedAt < latest);
        states[item.id] = { status, pending };
        for (const record of valid) {
            if (record.source === 'review') days.add(formatDateTime(record.createdAt, 'yyyy-MM-dd', timeZone));
        }
        // 没有历次概率快照时，仅单次有效作答且同日已评估能确认首次掌握日；其余宁缺勿猜。
        const earnedDay = status === 'mastered' && !pending && records.length === 1 && valid.length === 1
            && item.masteryEvaluatedAt && item.masteryEvaluatedAt <= now
            && formatDateTime(item.masteryEvaluatedAt, 'yyyy-MM-dd', timeZone) === formatDateTime(valid[0].createdAt, 'yyyy-MM-dd', timeZone)
            ? formatDateTime(valid[0].createdAt, 'yyyy-MM-dd', timeZone) : null;
        for (const tag of new Map(item.tags.map(tag => [JSON.stringify([tag.tagSet, tag.name]), tag])).values()) {
            const key = JSON.stringify([item.subjectId, tag.tagSet, tag.name]);
            let group = groups.get(key);
            if (!group) {
                group = { sticker: { key, name: tag.name, tagSet: tag.tagSet, subjectId: item.subjectId, subjectName: item.subjectName,
                    subjectKey: item.subjectKey, state: 'missing', itemIds: [], total: 0, remaining: 0, earnedDay: null }, results: [], earnedDays: [] };
                groups.set(key, group);
            }
            group.sticker.total++;
            group.sticker.itemIds.push(item.id);
            if (status !== 'mastered') group.sticker.remaining++;
            group.results.push(...valid.filter(record => record.createdAt >= recentStart).map(record => record.result!));
            group.earnedDays.push(earnedDay);
        }
    }
    const stickers = [...groups.values()].map(({ sticker, results, earnedDays }) => {
        sticker.itemIds.sort();
        sticker.state = sticker.remaining === 0 ? 'earned' : results.length > 0 && results.every(result => result === 'correct') ? 'improving' : 'missing';
        if (sticker.state === 'earned' && earnedDays.every(date => date !== null)) sticker.earnedDay = (earnedDays as string[]).sort().at(-1) ?? null;
        return sticker;
    }).sort((a, b) => (a.subjectName ?? '').localeCompare(b.subjectName ?? '', 'zh')
        || (a.subjectId ?? '').localeCompare(b.subjectId ?? '') || a.tagSet.localeCompare(b.tagSet) || a.name.localeCompare(b.name, 'zh') || a.key.localeCompare(b.key));
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    const weekStart = formatDateTime(getDayRange(now, timeZone, -((weekday + 6) % 7)).start, 'yyyy-MM-dd', timeZone);
    return { stickers, earned: stickers.filter(sticker => sticker.state === 'earned').length,
        weeklyNew: stickers.filter(sticker => sticker.earnedDay !== null && sticker.earnedDay >= weekStart && sticker.earnedDay <= day),
        streak: computeCurrentStreak(days, day), reviewedToday: days.has(day), day, items: states };
}

/** 会话奖励只比较两次成功快照；缺题或评估未完成时不发掌握奖励。 */
export function compareSessionProgress(before: StudentProgress, after: StudentProgress, answeredIds: readonly string[]) {
    const ids = [...new Set(answeredIds)];
    const known = ids.every(id => before.items[id] && after.items[id] && !before.items[id].pending && !after.items[id].pending);
    const mastered = known ? ids.filter(id => before.items[id].status !== 'mastered' && after.items[id].status === 'mastered').length : null;
    const earnedBefore = new Map(before.stickers.map(sticker => [sticker.key, sticker.state]));
    return { mastered, newStickers: known ? after.stickers.filter(sticker => sticker.state === 'earned' && earnedBefore.has(sticker.key) && earnedBefore.get(sticker.key) !== 'earned'
            && sticker.itemIds.some(id => ids.includes(id) && before.items[id]?.status !== 'mastered' && after.items[id]?.status === 'mastered')) : [] };
}
