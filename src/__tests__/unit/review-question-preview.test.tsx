import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReviewQuestionList } from '@/components/review/review-question-list';
import { ReviewSummary } from '@/components/review/review-summary';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { reviewQuestionPreviewMarkdown } from '@/lib/question/review-preview';
import type { ReviewSessionItem } from '@/types/api';

vi.mock('@/contexts/TimeZoneContext', () => ({ useTimeZone: () => ({ timeZone: 'Asia/Shanghai' }) }));

const screens: [string, (items: ReviewSessionItem[]) => ReactNode][] = [
    ['今日清单', items => <ReviewQuestionList items={items} />],
    ['收工页', items => <ReviewSummary items={items} outcomes={items.map(item => ({ id: item.id, result: 'correct', nextReviewAt: null }))} />],
];

function render(screen: (items: ReviewSessionItem[]) => ReactNode, items: ReviewSessionItem[]) {
    const html = renderToStaticMarkup(<LanguageProvider>{screen(items)}</LanguageProvider>);
    return new DOMParser().parseFromString(html, 'text/html');
}

describe.each(screens)('%s的题干预览', (_name, screen) => {
    it.each([
        '先化简 $-3(x^2y-\\frac13xy^2)-(-3x^2y)$',
        '计算 $$\\frac{a_1^2}{b+1}$$',
        '$$\\begin{aligned}x_1&=1\\\\\n\n y^2&=2\\end{aligned}$$',
    ])('优先用新字段渲染完整公式，保留详情入口：%s', text => {
        const document = render(screen, [{ id: 'formula', questionPreview: '旧纯文本', questionPreviewMarkdown: reviewQuestionPreviewMarkdown(text), nextReviewAt: null }]);
        const link = document.querySelector('ol a')!;
        expect(link.getAttribute('href')).toBe('/error-items/formula');
        expect(link.querySelector('.katex')).not.toBeNull();
        expect(link.querySelector('.katex-error')).toBeNull();
        link.querySelectorAll('.katex-mathml').forEach(node => node.remove());
        expect(link.textContent).not.toContain('旧纯文本');
        expect(link.textContent).not.toMatch(/[\\$]/);
    });

    it('超长首公式完整渲染，摘要可横向查看且没有 CSS 截断', () => {
        const formula = `$\\frac{${'x_1^2+'.repeat(30)}1}{(a+b)^{100}}$`;
        const document = render(screen, [{ id: 'long', questionPreviewMarkdown: reviewQuestionPreviewMarkdown(formula), nextReviewAt: null }]);
        expect(document.querySelector('.katex-mathml annotation')?.textContent).toBe(formula.slice(1, -1));
        expect(document.querySelector('ol a .overflow-x-auto')).not.toBeNull();
        expect(document.querySelector('ol .truncate, ol .line-clamp-1')).toBeNull();
    });

    it('兼容缺少新字段的旧响应、空公式字段和题号回退', () => {
        const document = render(screen, [
            { id: 'old', questionPreview: '原纯文本 x_1^2', nextReviewAt: null },
            { id: 'null', questionPreview: '空字段的旧摘要', questionPreviewMarkdown: null, nextReviewAt: null },
            { id: 'empty', questionPreview: null, nextReviewAt: null },
        ]);
        const links = [...document.querySelectorAll('ol a')];
        expect(links[0].textContent).toContain('原纯文本 x_1^2');
        expect(links[1].textContent).toContain('空字段的旧摘要');
        expect(links[2].textContent).toContain('第 3 题');
        expect(document.querySelector('.katex')).toBeNull();
    });
});
