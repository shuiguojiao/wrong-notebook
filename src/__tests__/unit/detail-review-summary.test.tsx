import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewSummary } from '@/components/error-detail/review-summary';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { TimeZoneProvider } from '@/contexts/TimeZoneContext';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('@/components/mastery-panel', () => ({ MasteryPanel: () => null }));
vi.mock('@/components/error-detail/review-schedule-panel', () => ({ ReviewSchedulePanel: () => null }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe('详情复习轮次摘要', () => {
    it.each([false, true])('圆点来自完成轮次，完成状态 %s，不使用掌握概率', async completed => {
        vi.mocked(apiClient.get).mockImplementation(async url => url.endsWith('/review')
            ? { stage: completed ? 4 : 1, totalRounds: 4, nextReviewAt: completed ? null : '2026-11-10T16:00:00Z', completedAt: completed ? '2026-11-09T00:00:00Z' : null }
            : { masteryStatus: 'unmastered', masteryProbability: 0.99 });
        await act(async () => root.render(<LanguageProvider><TimeZoneProvider initialTimeZone="Asia/Shanghai"><ReviewSummary id="q1" revision="a" /></TimeZoneProvider></LanguageProvider>));
        expect(container.textContent).toContain('复习进度');
        expect(container.querySelectorAll('[data-review-complete]')).toHaveLength(4);
        expect(container.querySelectorAll('[data-review-complete="true"]')).toHaveLength(completed ? 4 : 1);
        expect(container.textContent).not.toContain('99%');
        if (completed) {
            expect(container.textContent).toContain('复习完成');
            expect(container.textContent).not.toContain('第 5 轮');
        } else {
            expect(container.textContent).toContain('第 2 轮 / 共 4 轮');
            expect(container.textContent).toContain('下次 11月11日');
        }
        await act(async () => container.querySelector('button')!.click());
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain('复习与掌握');
    });
});
