import { buildQuestionSummary } from '@/lib/question/question-summary';
import { rewardMeta } from './rules';
import type { Award } from './rules';

const DERIVED_TYPES = new Set(['mastered', 'sticker', 'streak', 'done']);

/** 历史派生成果只计入余额，不挤入当天或本周所得。 */
export function countsForDay(entry: Award): boolean {
    return !(DERIVED_TYPES.has(entry.type) && rewardMeta(entry.meta).backfilled);
}

export function rewardQuestionPreview(item: { questionText: string | null; ocrText: string | null }): string {
    return buildQuestionSummary(item.questionText || item.ocrText, 60).map(part => part.type === 'math' ? `$${part.tex}$` : part.value).join('');
}
