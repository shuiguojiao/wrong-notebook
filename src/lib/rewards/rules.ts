import { formatDateTime } from '@/lib/date-time';
import type { StudentProgress } from '@/lib/student-progress';

export const REWARD_RULES_VERSION = 1;
export const REWARD_RULES = {
    review: { points: 1, limit: 40 },
    practice: { points: 1, hardCorrect: 3, limit: 5 },
    exam: { points: 1, limit: 20 },
    correction: { points: 2 },
    brave: { points: 2, correct: 5, minStars: 4, limit: 3 },
    mastered: { points: 5 },
    sticker: { points: 20 },
    done: { points: 5 },
    streak: { 3: 10, 7: 20, 14: 30, 30: 50, 60: 80, 100: 100 },
} as const;

export interface RewardRecord {
    id: string;
    source: string;
    result: string | null;
    errorItemId: string | null;
    examAttemptId: string | null;
    examQuestionId?: string | null;
    difficulty: string | null;
    createdAt: Date;
}

export interface RewardItem {
    difficultyStars: number | null;
    /** 即时记账只传入当前记录，改正判定仍读取该题此前的有效记录。 */
    previousRecords?: readonly RewardRecord[];
}

export interface RewardMeta {
    rulesVersion: number;
    errorItemId?: string | null;
    source?: string;
    result?: string | null;
    difficultyStars?: number;
    examAttemptId?: string;
    examQuestionId?: string;
    backfilled?: boolean;
}

export interface Award {
    day: string;
    type: string;
    points: number;
    refKey: string;
    meta: string | null;
}

export function rewardMeta(raw: string | null): RewardMeta {
    try {
        const value: unknown = JSON.parse(raw ?? '{}');
        return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RewardMeta : { rulesVersion: REWARD_RULES_VERSION };
    }
    catch { return { rulesVersion: REWARD_RULES_VERSION }; }
}

const entryKey = (entry: Pick<Award, 'type' | 'refKey'>) => JSON.stringify([entry.type, entry.refKey]);
const validPrevious = (record: RewardRecord) => record.source !== 'duplicate_import' && Boolean(record.result);
const compareRecords = (a: RewardRecord, b: RewardRecord) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 上限按获奖记录数计算；已删除题目与重写试卷记录的账目仍占用额度。 */
export function awardsForRecords(records: readonly RewardRecord[], items: ReadonlyMap<string, RewardItem>, existing: readonly Award[], timeZone: string): Award[] {
    const awards: Award[] = [];
    const settled = new Set(existing.filter(entry => entry.refKey.startsWith('record:')).map(entry => entry.refKey));
    const counts = new Map<string, number>();
    const examSlots = new Set<string>();
    const countKey = (entry: Award) => JSON.stringify([entry.type, entry.day, entry.type === 'exam' ? rewardMeta(entry.meta).examAttemptId : null]);
    for (const entry of existing) {
        const key = countKey(entry);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        const meta = rewardMeta(entry.meta);
        if (meta.examAttemptId && meta.examQuestionId) examSlots.add(JSON.stringify([meta.examAttemptId, meta.examQuestionId]));
    }
    const previous = new Map<string, RewardRecord>();
    for (const record of records) {
        const item = record.errorItemId ? items.get(record.errorItemId) : undefined;
        const prior = item?.previousRecords?.filter(candidate => validPrevious(candidate) && compareRecords(candidate, record) < 0).at(-1)
            ?? (record.errorItemId ? previous.get(record.errorItemId) : undefined);
        if (record.errorItemId && validPrevious(record)) previous.set(record.errorItemId, record);
        const refKey = `record:${record.id}`;
        const slot = record.examAttemptId && record.examQuestionId ? JSON.stringify([record.examAttemptId, record.examQuestionId]) : undefined;
        if (settled.has(refKey) || (slot && examSlots.has(slot)) || !['correct', 'wrong'].includes(record.result ?? '')) continue;
        if (!['review', 'practice', 'exam'].includes(record.source) || (record.source === 'exam' && !record.examAttemptId)) continue;
        const day = formatDateTime(record.createdAt, 'yyyy-MM-dd', timeZone);
        const meta: RewardMeta = { rulesVersion: REWARD_RULES_VERSION, errorItemId: record.errorItemId, source: record.source, result: record.result,
            ...(item?.difficultyStars != null ? { difficultyStars: item.difficultyStars } : {}),
            ...(record.examAttemptId ? { examAttemptId: record.examAttemptId } : {}),
            ...(record.examQuestionId ? { examQuestionId: record.examQuestionId } : {}) };
        const add = (type: string, points: number, limit = Infinity) => {
            const entry = { day, type, points, refKey, meta: JSON.stringify(meta) };
            const key = countKey(entry);
            if ((counts.get(key) ?? 0) >= limit) return;
            counts.set(key, (counts.get(key) ?? 0) + 1);
            awards.push(entry);
        };
        const rule = REWARD_RULES[record.source as 'review' | 'practice' | 'exam'];
        add(record.source, record.source === 'practice' && record.result === 'correct' && ['hard', 'harder'].includes(record.difficulty ?? '')
            ? REWARD_RULES.practice.hardCorrect : rule.points, rule.limit);
        if (record.source !== 'practice') {
            if (record.result === 'correct' && prior?.result === 'wrong') add('correction', REWARD_RULES.correction.points);
            if ((item?.difficultyStars ?? 0) >= REWARD_RULES.brave.minStars) add('brave', record.result === 'correct' ? REWARD_RULES.brave.correct : REWARD_RULES.brave.points, REWARD_RULES.brave.limit);
        }
        if (slot) examSlots.add(slot);
        settled.add(refKey);
    }
    return awards;
}

/** 日期键做日历运算，不受夏令时切换影响。 */
export function shiftDay(day: string, offset: number): string {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}

export function settleDerived(progress: StudentProgress, queueEmpty: boolean, todayReviewed: number, existing: readonly Award[], now: Date, timeZone: string): Award[] {
    const day = formatDateTime(now, 'yyyy-MM-dd', timeZone);
    const keys = new Set(existing.map(entryKey));
    const awards: Award[] = [];
    const add = (type: string, points: number, refKey: string, extra: Partial<RewardMeta> = {}) => {
        const entry = { day, type, points, refKey, meta: JSON.stringify({ rulesVersion: REWARD_RULES_VERSION, ...extra }) };
        if (!keys.has(entryKey(entry))) { awards.push(entry); keys.add(entryKey(entry)); }
    };
    for (const [id, item] of Object.entries(progress.items)) {
        if (item.status === 'mastered' && !item.pending) add('mastered', REWARD_RULES.mastered.points, `item:${id}`, { errorItemId: id });
    }
    for (const sticker of progress.stickers) {
        if (sticker.state === 'earned') add('sticker', REWARD_RULES.sticker.points, `sticker:${sticker.key}`);
    }
    if (queueEmpty && todayReviewed > 0) add('done', REWARD_RULES.done.points, `day:${day}`);
    const start = shiftDay(day, -(progress.streak - 1) - (progress.reviewedToday ? 0 : 1));
    for (const [milestone, points] of Object.entries(REWARD_RULES.streak)) {
        if (progress.streak >= Number(milestone)) add('streak', points, `streak:${milestone}:${start}`);
    }
    return awards;
}
