import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TodayDashboard } from '@/components/student/today-dashboard';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { computeStudentProgress } from '@/lib/student-progress';

const mocks = vi.hoisted(() => ({ get: vi.fn(), enabled: true }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get } }));
vi.mock('@/lib/hooks/use-today-review', () => ({ useTodayReview: () => ({ status: 'ready', notebooks: [], completed: 0 }) }));
vi.mock('@/components/home-hero', () => ({ HomeHero: ({ streak, balance, week }: { streak: ReactNode; balance: ReactNode; week: ReactNode }) => <header>{streak}{balance}{week}</header> }));
vi.mock('@/components/student/today-task-status', () => ({ TodayTaskStatus: () => null }));
vi.mock('@/components/student/today-entry', () => ({ TodayEntry: () => null }));
const progress = computeStudentProgress([], .5, new Date('2026-11-11T04:00:00Z'), 'Asia/Shanghai');
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    mocks.enabled = true;
    let progressReads = 0;
    mocks.get.mockReset().mockImplementation(async (url: string) => {
        if (url === '/api/student-progress') {
            progressReads++;
            return progressReads === 1 ? progress : { ...progress, leaveDays: ['2026-11-10'], streak: 4 };
        }
        if (url.includes('/week?')) return { empty: true };
        return {
            enabled: mocks.enabled, balance: 1, leave: { held: 1, usedDay: '2026-11-10', earnedDay: null }, lastStreak: null,
            weekly: { reached: false, box: null }, brave: null, recentBadges: [], today: { day: progress.day },
            week: { start: '2026-11-09', completedDays: [], goalDays: 4 },
        };
    });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<LanguageProvider><TodayDashboard showEntry={false} /></LanguageProvider>)); }
it('结算晚于印章读取时，补卡日缺失触发一次同源刷新，首屏保留连续数', async () => {
    await render();
    expect(mocks.get.mock.calls.filter(call => call[0] === '/api/student-progress')).toHaveLength(2);
    expect(container.querySelector('.student-streak-number')?.textContent).toBe('4');
    expect(container.textContent).toContain('用了一张请假卡，连续还在');
    await render();
    expect(mocks.get.mock.calls.filter(call => call[0] === '/api/student-progress')).toHaveLength(2);
});
it('奖励关闭时不刷新补卡、无角标和提示，也不请求上周手账', async () => {
    mocks.enabled = false; await render();
    expect(mocks.get.mock.calls.filter(call => call[0] === '/api/student-progress')).toHaveLength(1);
    expect(mocks.get.mock.calls.some(call => String(call[0]).includes('/week?'))).toBe(false);
    expect(container.querySelector('.student-leave-badge')).toBeNull();
    expect(container.textContent).not.toContain('请假卡');
    expect(container.textContent).not.toContain('本周手账');
    expect(container.textContent).not.toContain('本周目标达成');
});
