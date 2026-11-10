import { cleanMarkdown } from '@/lib/markdown-utils';
import { extractMathSegments, restoreMathSegments } from '@/lib/markdown-math';
import { truncateQuestionPreview } from '@/lib/question/question-preview';
import { buildQuestionSummary } from '@/lib/question/question-summary';

export const REVIEW_PREVIEW_MAX_LENGTH = 40;

/** 兼容旧客户端的纯文本摘要，保留原有字段的清理与截断行为。 */
export function reviewQuestionPreview(text: string | null | undefined): string | null {
    if (!text) return null;
    const normalized = text.replace(/\\[()[\]]/g, '')
        .replace(/\\([a-zA-Z]+)/g, (command, name: string) =>
            /^(left|right|begin|end|text|mbox|frac|sqrt|leq?|geq?|times|div|cdot|neq|approx|pm|infty|circ|triangle|angle|because|therefore)$/.test(name) ? command : '');
    const plain = cleanMarkdown(normalized)
        .replace(/(?:begin|end)\{[^}]*\}/g, '')
        .replace(/[{}]/g, '');
    return truncateQuestionPreview(plain, REVIEW_PREVIEW_MAX_LENGTH);
}

/** 公式预览沿用题干摘要的长度规则；公式整体保留或整体省略，不能截断命令和括号。 */
export function reviewQuestionPreviewMarkdown(text: string | null | undefined): string | null {
    const { masked, segments } = extractMathSegments(text);
    // 仅合并公式外的空白，保留行间公式内部的换行和完整定界符。
    const normalized = restoreMathSegments(masked.replace(/\s+/g, ' ').trim(), segments);
    const parts = buildQuestionSummary(normalized, REVIEW_PREVIEW_MAX_LENGTH);
    const formulas = new Map(segments.map(segment => [segment.tex.trim(), segment.source]));
    return parts.map(part => part.type === 'math'
        // 找不到原定界符时退回行内公式，避免公式被静默丢弃。
        ? formulas.get(part.tex) ?? `$${part.tex}$`
        : part.value).join('').trim() || null;
}
