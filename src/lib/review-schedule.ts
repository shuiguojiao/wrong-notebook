import { getDayRange, shiftCalendarDate } from '@/lib/date-time';
import { normalizeQuestionType } from '@/lib/question/question-type';
import { inferSubjectFromName } from '@/lib/tags/knowledge-tags';

export const REVIEW_INTERVALS = { memory: [1, 3, 7, 15, 30], method: [3, 7, 21, 45] } as const;
export type ReviewKind = keyof typeof REVIEW_INTERVALS;
export type ReviewConfidence = 'sure' | 'unsure';
export interface ReviewItem {
    id: string;
    createdAt: Date;
    questionType?: string | null;
    subject?: { subjectKey?: string | null; name: string } | null;
}
export interface ReviewRecord {
    id?: string;
    result: string | null;
    confidence?: string | null;
    createdAt: Date;
}
export interface ReviewOverride { action: 'completed' | 'restart'; at: Date }
export interface ReviewState {
    reviewStage: number;
    reviewWrongStreak: number;
    nextReviewAt: Date | null;
    reviewCompletedAt: Date | null;
}
export interface ReviewPlan {
    stage: number;
    nextReviewAt: Date | null;
    completedAt?: Date | null;
    wrongStreak?: number;
}

const WINDOWS: Record<number, readonly [number, number]> = {
    1: [1, 1], 3: [3, 4], 7: [6, 8], 15: [13, 17], 21: [18, 24], 30: [26, 34], 45: [40, 50],
};

/** 题型表没有细分字词、默写和古诗文背诵，语文仅将填空类作为记忆型。 */
export function reviewKind(item: Pick<ReviewItem, 'subject' | 'questionType'>): ReviewKind {
    const subject = item.subject?.subjectKey || inferSubjectFromName(item.subject?.name ?? null);
    return subject === 'english' || (subject === 'chinese' && normalizeQuestionType(item.questionType) === 'fill_blank') ? 'memory' : 'method';
}

/** 固定无符号哈希；不读取时钟、随机数或其他题目的负载。 */
export function reviewWindowDays(itemId: string, stage: number, kind: ReviewKind): number {
    const interval = REVIEW_INTERVALS[kind][stage];
    if (interval === undefined) throw new RangeError('复习轮次超出范围');
    const [min, max] = WINDOWS[interval];
    let hash = 2166136261;
    for (const char of `${itemId}:${stage}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return min + hash % (max - min + 1);
}

/** 唯一规则来源：忽略未作答，按时间与记录 ID 重放；不修改输入，不依赖已缓存的调度字段。 */
export function rebuildReviewState(item: ReviewItem, records: readonly ReviewRecord[], overrides: readonly ReviewOverride[], timeZone: string): ReviewState {
    const kind = reviewKind(item);
    const count = REVIEW_INTERVALS[kind].length;
    const override = [...overrides].sort((a, b) => a.at.getTime() - b.at.getTime()).at(-1);
    let stage = override?.action === 'completed' ? count : 0;
    let wrongStreak = 0;
    let completedAt = override?.action === 'completed' ? override.at : null;
    const nextDate = (from: Date, days: number) => getDayRange(shiftCalendarDate(from, timeZone, days), timeZone).start;
    let nextReviewAt = completedAt ? null : nextDate(override?.at ?? item.createdAt, override?.action === 'restart' ? 1 : reviewWindowDays(item.id, 0, kind));
    const answered = records.filter(record => (record.result === 'correct' || record.result === 'wrong')
        && (!override || record.createdAt > override.at))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || ((a.id ?? '') < (b.id ?? '') ? -1 : (a.id ?? '') > (b.id ?? '') ? 1 : 0));
    for (const record of answered) {
        // 完成后再次作答从最后一轮继续；手动完成与自然完成使用同一规则。
        stage = Math.min(stage, count - 1);
        if (record.result === 'correct') {
            stage = Math.min(count, stage + (record.confidence === 'sure' ? 2 : 1));
            wrongStreak = 0;
        } else {
            wrongStreak++;
            stage = wrongStreak >= 2 ? 0 : Math.max(0, stage - 2);
        }
        completedAt = stage >= count ? record.createdAt : null;
        nextReviewAt = completedAt ? null : nextDate(record.createdAt, reviewWindowDays(item.id, stage, kind));
    }
    return { reviewStage: stage, reviewWrongStreak: wrongStreak, nextReviewAt, reviewCompletedAt: completedAt };
}

export function reviewPlanOf(state: ReviewState): ReviewPlan {
    return { stage: state.reviewStage, nextReviewAt: state.nextReviewAt, completedAt: state.reviewCompletedAt, wrongStreak: state.reviewWrongStreak };
}

/** 下次复习日不晚于应用时区的今天，且尚未复习完成。 */
export function isReviewDue(plan: ReviewPlan, timeZone: string, now = new Date()): boolean {
    return !plan.completedAt && plan.nextReviewAt !== null && plan.nextReviewAt < getDayRange(now, timeZone).end;
}
