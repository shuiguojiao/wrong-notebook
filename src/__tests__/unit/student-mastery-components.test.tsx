import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MasteryStatusBadge } from '@/components/mastery-status-badge';
import { MasteryProgressBar } from '@/components/stats/mastery-progress-bar';
import { WrongAnswerStats } from '@/components/stats/wrong-answer-stats';
import { LanguageProvider } from '@/contexts/LanguageContext';

vi.mock('@/lib/hooks/use-stats-data', () => ({
    useStatsData: () => ({
        data: { totalErrors: 10, newCount: 3, reviewingCount: 2, masteredCount: 5, masteryRate: 50 },
        loading: false, error: false, reload: vi.fn(),
    }),
}));
vi.mock('@/components/stats/collection-summary', () => ({ CollectionSummary: () => null }));
vi.mock('@/components/stats/wrong-answer-charts', () => ({ WrongAnswerCharts: () => null }));

describe('学生掌握状态展示', () => {
    it('new 与 reviewing 徽标统一用词，mastered 保留已掌握', () => {
        for (const status of ['new', 'reviewing', 'mastered'] as const) {
            const html = renderToStaticMarkup(<LanguageProvider><MasteryStatusBadge status={status} /></LanguageProvider>);
            expect(html).toContain(status === 'mastered' ? '已掌握' : '还没掌握');
            expect(html).not.toMatch(/待复习|复习中/);
        }
    });

    it('进度条合并数量，只展示一个未掌握图例与区段', () => {
        const container = document.createElement('div');
        container.innerHTML = renderToStaticMarkup(<LanguageProvider><MasteryProgressBar total={10} newCount={3} reviewingCount={2} masteredCount={5} /></LanguageProvider>);
        expect(container.querySelectorAll('[style*="width:50%"]')).toHaveLength(2);
        expect(container.textContent).toBe('还没掌握5已掌握5');
        expect(renderToStaticMarkup(<LanguageProvider><MasteryProgressBar total={0} newCount={0} reviewingCount={0} masteredCount={0} /></LanguageProvider>)).toBe('');
    });

    it('统计卡片合并未掌握两类，入口使用 unmastered', () => {
        const container = document.createElement('div');
        container.innerHTML = renderToStaticMarkup(<LanguageProvider><WrongAnswerStats url="/test-stats" weakTagsUrl="/test-tags" subjectId="math" /></LanguageProvider>);
        const link = container.querySelector('a[aria-label="查看还没掌握的错题"]');
        expect(link?.getAttribute('href')).toBe('/notebooks/math?mastery=unmastered');
        expect(link?.textContent).toBe('还没掌握5还需要练习的错题');
        expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(3);
        expect(container.querySelectorAll('a[href*="mastery=new"], a[href*="mastery=reviewing"]')).toHaveLength(0);
        expect(container.textContent).not.toMatch(/待复习|复习中/);
    });
});
