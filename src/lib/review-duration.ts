import { inferSubjectFromName } from '@/lib/tags/knowledge-tags';

export interface ReviewSubject { subjectKey?: string | null; name: string }
export interface DurationSample { subject?: ReviewSubject | null; durationSec: number | null; createdAt: Date }

export function reviewSubjectKey(subject?: ReviewSubject | null): string {
    return subject?.subjectKey || inferSubjectFromName(subject?.name ?? null) || 'unknown';
}

export function defaultReviewSeconds(subjectKey: string): number {
    return ['math', 'physics', 'chemistry'].includes(subjectKey) ? 240 : subjectKey === 'english' ? 60 : 120;
}

/** 每科只取最近二十条有效记录；异常值不占样本名额，偶数样本取中间两值平均。 */
export function estimateReviewSeconds(samples: readonly DurationSample[]): Map<string, number> {
    const groups = new Map<string, number[]>();
    for (const sample of [...samples].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
        if (sample.durationSec === null || !Number.isFinite(sample.durationSec) || sample.durationSec < 10 || sample.durationSec > 1800) continue;
        const key = reviewSubjectKey(sample.subject);
        const values = groups.get(key) ?? [];
        if (values.length < 20) values.push(sample.durationSec);
        groups.set(key, values);
    }
    return new Map([...groups].filter(([, values]) => values.length >= 5).map(([key, values]) => {
        values.sort((a, b) => a - b);
        const middle = Math.floor(values.length / 2);
        return [key, values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2];
    }));
}

export function reviewSeconds(subject: ReviewSubject | null | undefined, estimates: ReadonlyMap<string, number>): number {
    const key = reviewSubjectKey(subject);
    return estimates.get(key) ?? defaultReviewSeconds(key);
}
