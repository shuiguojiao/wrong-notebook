import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewSchedulePanel } from '@/components/error-detail/review-schedule-panel';
import { LanguageProvider } from '@/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: mocks }));
vi.mock('@/contexts/TimeZoneContext', () => ({ useTimeZone: () => ({ timeZone: 'Asia/Shanghai' }) }));
let container: HTMLDivElement;
let root: Root;
const initial = { stage: 1, totalRounds: 4, nextReviewAt: '2026-11-10T16:00:00Z', completedAt: null };
const render = async (revision = 'a') => { await act(async () => root.render(<LanguageProvider><ReviewSchedulePanel id="q1" revision={revision} /></LanguageProvider>)); };
const click = async (name: string) => {
    const button = [...container.querySelectorAll('button')].find(value => value.textContent === name)!;
    expect(button).toBeTruthy(); await act(async () => button.click());
};
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.setItem('language', 'zh');
    container = document.createElement('div'); root = createRoot(container);
    mocks.get.mockReset().mockResolvedValue(initial); mocks.put.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

describe('详情页独立的复习安排', () => {
    it('用轮次和当地日期展示，不使用内部档位术语', async () => {
        await render(); expect(container.textContent).toContain('第 2 / 4 轮'); expect(container.textContent).toContain('2026-11-11');
        expect(container.textContent).not.toContain('档位'); expect(mocks.get).toHaveBeenCalledWith('/api/error-items/q1/review');
    });
    it('手动完成与重新加入只修改复习接口，立即显示新状态', async () => {
        await render(); mocks.put.mockResolvedValueOnce({ ...initial, stage: 4, nextReviewAt: null, completedAt: '2026-11-08T12:00:00Z' });
        await click('标记复习完成'); expect(mocks.put).toHaveBeenCalledWith('/api/error-items/q1/review', { action: 'completed' });
        expect(container.textContent).toContain('复习完成'); expect(container.textContent).not.toContain('第 5 / 4');
        mocks.put.mockResolvedValueOnce({ ...initial, stage: 0 }); await click('重新加入复习');
        expect(container.textContent).toContain('第 1 / 4 轮'); expect(mocks.put).toHaveBeenLastCalledWith('/api/error-items/q1/review', { action: 'restart' });
    });
    it('手动完成后的状态不被较早发起的读取响应覆盖', async () => {
        await render(); let resolve!: (value: typeof initial) => void;
        mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        await render('b'); mocks.put.mockResolvedValueOnce({ ...initial, nextReviewAt: null, completedAt: '2026-11-08T12:00:00Z' });
        await click('标记复习完成'); await act(async () => resolve(initial));
        expect(container.textContent).toContain('复习完成'); expect(container.textContent).not.toContain('第 2 / 4 轮');
    });
    it('变更失败保留旧安排并提示，历史或分类版本变化后重新加载', async () => {
        await render(); mocks.put.mockRejectedValueOnce(new Error('离线')); await click('重新加入复习');
        expect(container.querySelector('[role="alert"]')).toBeTruthy(); expect(container.textContent).toContain('第 2 / 4 轮');
        mocks.get.mockResolvedValueOnce({ ...initial, stage: 2 }); await render('b');
        expect(container.textContent).toContain('第 3 / 4 轮'); expect(container.querySelector('[role="alert"]')).toBeNull();
    });
});
