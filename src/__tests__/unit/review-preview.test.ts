import { describe, expect, it } from 'vitest';
import { reviewQuestionPreview } from '@/lib/question/review-preview';

describe('复习题干纯文本摘要', () => {
    it('清理 Markdown 和 LaTeX，保留文字与公式含义', () => {
        expect(reviewQuestionPreview('## **求值** [题目](https://example.com) $\\frac{1}{2} \\times x^{2}$')).toBe('求值 题目 1/2 × x^2');
        expect(reviewQuestionPreview('$\\mathbf{x}_{1}$')).toBe('x_1');
        expect(reviewQuestionPreview('计算 \\(x+1\\)')).toBe('计算 x+1');
    });
    it('清理空白后截取约 40 字，空题干允许回退题号', () => {
        expect(reviewQuestionPreview('题'.repeat(41))).toBe('题'.repeat(40) + '…');
        expect(reviewQuestionPreview('题'.repeat(40))).toBe('题'.repeat(40));
        expect(reviewQuestionPreview('  **已知**\n 求值 ')).toBe('已知 求值');
        expect(reviewQuestionPreview(null)).toBeNull();
    });
});
