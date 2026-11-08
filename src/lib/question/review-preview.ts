import { cleanMarkdown } from '@/lib/markdown-utils';
import { truncateQuestionPreview } from '@/lib/question/question-preview';

/** 小结只显示纯文本，保留文字及常用公式符号并移除剩余的 LaTeX 标记。 */
export function reviewQuestionPreview(text: string | null | undefined): string | null {
    if (!text) return null;
    const normalized = text.replace(/\\[()[\]]/g, '')
        .replace(/\\([a-zA-Z]+)/g, (command, name: string) =>
            /^(left|right|begin|end|text|mbox|frac|sqrt|leq?|geq?|times|div|cdot|neq|approx|pm|infty|circ|triangle|angle|because|therefore)$/.test(name) ? command : '');
    const plain = cleanMarkdown(normalized)
        .replace(/(?:begin|end)\{[^}]*\}/g, '')
        .replace(/[{}]/g, '');
    return truncateQuestionPreview(plain, 40);
}
