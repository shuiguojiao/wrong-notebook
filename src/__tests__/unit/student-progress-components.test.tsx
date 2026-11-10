import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionSummary } from '@/components/stats/collection-summary';
import { ReviewSummary } from '@/components/review/review-summary';
import { ProgressRewards, StreakReward } from '@/components/student/progress-rewards';
import { LanguageProvider } from '@/contexts/LanguageContext';
import type { StudentProgress, StudentSticker } from '@/lib/student-progress';

const mocks = vi.hoisted(() => ({ useData: vi.fn() }));
vi.mock('@/lib/hooks/use-stats-data', () => ({ useStatsData: mocks.useData }));
const sticker: StudentSticker = { key: 'tag', name: '方程', subjectId: 'math', subjectName: '数学', subjectKey: 'math', tagSet: 'default', state: 'earned', itemIds: ['q'], total: 1, remaining: 0, earnedDay: null };
const data: StudentProgress = { stickers: [sticker], earned: 1, items: {}, weeklyNew: [], streak: 3, reviewedToday: false, day: '2026-11-10' };
beforeEach(() => { mocks.useData.mockReturnValue({ data, loading: false, error: false, reload: vi.fn() }); });

describe('学生奖励与同源摘要', () => {
    it('今天尚未复习显示截至昨天的连续数，没有证据不显示本周新贴纸', () => {
        const html = renderToStaticMarkup(<LanguageProvider><StreakReward data={data} /><ProgressRewards data={data} /></LanguageProvider>);
        expect(html).toContain('连续 3 天');
        expect(html).toContain('今天复习后继续');
        expect(html).not.toContain('这周新贴纸');
        expect(html).toContain('student-today-streak');
    });
    it('有可核实贴纸才显示周奖励和收集册入口', () => {
        const reviewed = { ...data, weeklyNew: [sticker], reviewedToday: true };
        const html = renderToStaticMarkup(<LanguageProvider><StreakReward data={reviewed} /><ProgressRewards data={reviewed} /></LanguageProvider>);
        expect(html).toContain('这周新贴纸');
        expect(html).toContain('href="/collection"');
        expect(html).not.toContain('今天复习后继续');
        expect(html).toContain('data-state="earned"');
        expect(html).toContain('data-subject="math"');
        expect(html).toContain('方程');
        expect(html).toContain('收集册');
        expect(html).not.toContain('data-paper');
    });
    it('没有本周新贴纸时整个周奖励区域隐藏', () => {
        expect(renderToStaticMarkup(<LanguageProvider><ProgressRewards data={data} /></LanguageProvider>)).toBe('');
    });
    it('统计摘要按学科筛选同一进度全集，显示范围说明与入口', () => {
        const html = renderToStaticMarkup(<LanguageProvider><CollectionSummary subjectId="math" /></LanguageProvider>);
        expect(html).toContain('已贴 1 / 1 张');
        expect(html).toContain('不受统计时间范围影响');
        expect(html).toContain('href="/collection"');
    });
    it('收工显示实际掌握变化、新贴纸和连续印章，取数失败仍为未知', () => {
        const props = { items: [{ id: 'q', nextReviewAt: null }], outcomes: [{ id: 'q', nextReviewAt: null, result: 'correct' as const }], completionDate: '2026-11-10' };
        const html = renderToStaticMarkup(<LanguageProvider><ReviewSummary {...props} progress={{ mastered: 1, streak: 3, newStickers: [sticker] }} /></LanguageProvider>);
        expect(html).toContain('连续 3 天');
        expect(html).toContain('新贴纸到手');
        expect(html).not.toContain('待确认');
        const unknown = renderToStaticMarkup(<LanguageProvider><ReviewSummary {...props} progress={null} /></LanguageProvider>);
        expect(unknown).toContain('待确认');
        expect(unknown).not.toContain('新贴纸到手');
    });
});
