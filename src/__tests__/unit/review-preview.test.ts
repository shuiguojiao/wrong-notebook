import { describe, expect, it } from 'vitest';
import { extractMathSegments } from '@/lib/markdown-math';
import { buildQuestionSummary } from '@/lib/question/question-summary';
import { reviewQuestionPreview, reviewQuestionPreviewMarkdown } from '@/lib/question/review-preview';

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

describe('复习题干公式摘要', () => {
    it('保留分数、嵌套括号和上下标，普通文字仍去除 Markdown', () => {
        const text = '**第21题**：先化简，再求值：$-3(x^2y-\\frac13xy^2)-(-3x^2y)$';
        expect(reviewQuestionPreviewMarkdown(text)).toBe('第21题：先化简，再求值：$-3(x^2y-\\frac13xy^2)-(-3x^2y)$');
        expect(reviewQuestionPreviewMarkdown('求 $\\frac{a_{1}^{2}}{\\sqrt{x^{2}+1}}$ 的值'))
            .toBe('求 $\\frac{a_{1}^{2}}{\\sqrt{x^{2}+1}}$ 的值');
    });

    it.each([
        '$$\\frac{1}{2}+x_1^2$$',
        '$$\\begin{aligned}\n x_1^2&=\\frac{1}{2}\\\\\n\n y&=2\n\\end{aligned}$$',
        '\\[\\frac{1}{2}+x_1^2\\]',
        '\\(\\frac{1}{2}+x_1^2\\)',
    ])('行内及行间公式转交摘要组件后仍是完整公式：%s', formula => {
        const preview = reviewQuestionPreviewMarkdown(`计算\n\n${formula}\n\n并说明理由`)!;
        const original = extractMathSegments(formula).segments[0];
        expect(preview).toContain(original.source);
        expect(buildQuestionSummary(preview, 40)).toContainEqual({ type: 'math', tex: original.tex.trim() });
    });

    it('长度不足时在公式前省略，超长首公式整体保留，不拆开定界符或命令', () => {
        const formula = '$\\frac{a_{123}^{456}+b_{789}}{c_{123}^{456}+d_{789}}$';
        expect(reviewQuestionPreviewMarkdown('题'.repeat(35) + formula)).toBe('题'.repeat(35) + '...');
        const longFormula = `$\\frac{${'x_1^2+'.repeat(30)}1}{(a+b)^{100}}$`;
        expect(reviewQuestionPreviewMarkdown(longFormula)).toBe(longFormula);
        expect(reviewQuestionPreviewMarkdown(longFormula + '后文')).toBe(longFormula + '...');
    });

    it('边界附近的多个公式保持成对，省略号不落在公式内', () => {
        const first = '$x_1^2$';
        const second = '$\\frac{1}{2}$';
        const preview = reviewQuestionPreviewMarkdown('题'.repeat(30) + first + second + '后文')!;
        expect(preview).toBe('题'.repeat(30) + first + second + '后...');
        expect(extractMathSegments(preview).segments.map(segment => segment.source)).toEqual([first, second]);
        expect((preview.match(/\$/g) ?? []).length).toBe(4);
    });

    it('中英文混排保留正文与公式，纯文本及空内容继续兼容', () => {
        expect(reviewQuestionPreviewMarkdown('**已知** Find $x_{n+1}^{2}$，求 value。')).toBe('已知 Find $x_{n+1}^{2}$，求 value。');
        expect(reviewQuestionPreviewMarkdown('  **已知**\n\n 求值 ')).toBe('已知 求值');
        expect(reviewQuestionPreviewMarkdown('题'.repeat(40))).toBe('题'.repeat(40));
        expect(reviewQuestionPreviewMarkdown('题'.repeat(2000))).toBe('题'.repeat(40) + '...');
        for (const text of [null, undefined, '', ' \n\t ']) expect(reviewQuestionPreviewMarkdown(text)).toBeNull();
    });
});
