import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayRewards } from '@/components/student/today-rewards';
import { MeRewards } from '@/components/student/me-rewards';
import { RewardFeedback } from '@/components/review/reward-feedback';
import { ReviewRewards } from '@/components/review/review-rewards';
import { RewardSettings } from '@/components/settings/reward-settings';
import { HistoryDayList } from '@/components/history/history-day-list';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { savedReviewOutcome } from '@/lib/review-session';
import type { ReviewOutcome } from '@/lib/review-session';
import type { RewardEntryResponse, RewardSummaryResponse } from '@/types/api';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: mocks }));
vi.mock('@/contexts/TimeZoneContext', () => ({ useTimeZone: () => ({ timeZone: 'Asia/Shanghai' }) }));
const entry = (type: string, points: number, createdAt = '2026-11-11T04:01:00Z'): RewardEntryResponse => ({ type, points, createdAt, meta: {} });
const summary: RewardSummaryResponse = { brave: null, recentBadges: [], badgeCount: 0, balance: 100, today: { day: '2026-11-11', points: 9, entries: [] }, week: { start: '2026-11-09', goalDays: 4, points: 13, completedDays: ['2026-11-09'] }, streak: 3, reviewedToday: false, rulesVersion: 1, enabled: true };
const state = (data: RewardSummaryResponse | null = summary, loading = false, error = false) => ({ data, loading, error, reload: vi.fn() });
const outcomes: ReviewOutcome[] = [{ id: 'a', nextReviewAt: null, result: 'correct', rewards: [entry('review', 1), entry('correction', 2), entry('brave', 5)] }, { id: 'b', nextReviewAt: null, result: 'wrong', rewards: [entry('practice', 3), entry('exam', 1)] }];
let root: Root;
let container: HTMLDivElement;
async function render(node: ReactNode) { await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>)); }
function button(text: string) { return [...container.querySelectorAll('button')].find(element => element.textContent === text)!; }
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.get.mockReset().mockResolvedValue(summary); mocks.patch.mockReset();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('今天页能量豆', () => {
    it('余额来自接口，七点按应用日期展示完成、过去、今天和未来', async () => {
        await render(<><TodayRewards rewards={state()} variant="balance" /><TodayRewards rewards={state()} variant="week" /></>);
        expect(container.querySelector('a[aria-label="能量豆 100 颗"]')?.getAttribute('href')).toBe('/history');
        expect([...container.querySelectorAll('[data-state]')].map(point => point.getAttribute('data-state'))).toEqual(['complete', 'missed', 'today', 'future', 'future', 'future', 'future']);
        expect(container.querySelector('a[href="/me#rewards"]')).toBeTruthy();
        expect(container.textContent).toContain('目标 4 天');
        expect(container.querySelector('[aria-current="date"]')?.getAttribute('aria-label')).toContain('今天还没完成');
    });
    it('达标后改用达标文案，今天完成后为实心豆', async () => {
        await render(<TodayRewards rewards={state({ ...summary, week: { ...summary.week, goalDays: 3, completedDays: ['2026-11-09', '2026-11-10', '2026-11-11'] } })} variant="week" />);
        expect(container.textContent).toContain('本周目标达成');
        expect(container.querySelector('[aria-current="date"]')?.getAttribute('data-state')).toBe('complete');
    });
    it.each(['balance', 'week'] as const)('%s 加载不显示零，失败和禁用时完全隐藏', async variant => {
        await render(<TodayRewards rewards={state(null, true)} variant={variant} />);
        expect(container.textContent).not.toContain('0'); expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
        await render(<TodayRewards rewards={state(summary, false, true)} variant={variant} />); expect(container.innerHTML).toBe('');
        await render(<TodayRewards rewards={state({ ...summary, enabled: false })} variant={variant} />); expect(container.innerHTML).toBe('');
    });
});

describe('单题奖励反馈', () => {
    it.each([
        { result: 'correct', entries: [entry('review', 1)], text: '+1 能量豆' },
        { result: 'correct', entries: outcomes[0].rewards, text: '+1 能量豆、改正 +2、勇者！+5' },
        { result: 'wrong', entries: [entry('exam', 1), entry('brave', 2)], text: '+1 能量豆、勇者也会摔跤 +2' },
        { result: 'correct', entries: [entry('practice', 3)], text: '+3 能量豆' },
    ])('账目文案使用实际点数：$text', async ({ result, entries, text }) => {
        await render(<RewardFeedback entries={entries} result={result} enabled />); expect(container.textContent).toBe(text);
    });
    it('空数组、禁用和撤销后均不显示', async () => {
        await render(<RewardFeedback entries={[]} result="correct" enabled />); expect(container.innerHTML).toBe('');
        await render(<RewardFeedback entries={outcomes[0].rewards} result="correct" enabled={false} />); expect(container.innerHTML).toBe('');
        await render(<RewardFeedback entries={outcomes[0].rewards} result="correct" enabled />); expect(container.textContent).toContain('改正 +2');
        await render(<RewardFeedback result="correct" enabled />); expect(container.innerHTML).toBe('');
    });
});

describe('收工账目', () => {
    it('保存结果保留接口账目，合并会话与开始时间之后的四类结算', async () => {
        const entries = [entry('done', 5), entry('mastered', 5), entry('sticker', 20), entry('streak', 10), entry('done', 5, '2026-11-11T03:00:00Z'), entry('review', 99)];
        mocks.get.mockResolvedValue({ ...summary, today: { ...summary.today, entries } });
        await render(<ReviewRewards outcomes={outcomes} startedAt="2026-11-11T04:00:00Z" />);
        expect(container.textContent).toContain('复习 5 颗'); expect(container.textContent).toContain('改正 2 颗'); expect(container.textContent).toContain('勇者 5 颗');
        expect(container.textContent).toContain('收工 +5'); expect(container.textContent).toContain('彻底掌握 1 题 +5'); expect(container.textContent).toContain('贴上贴纸 1 张 +20'); expect(container.textContent).toContain('连续 3 天 +10');
        expect(container.textContent).toContain('合计 52 颗'); expect(container.textContent).toContain('现在一共 100 颗');
        expect(mocks.get).toHaveBeenCalledTimes(2);
        expect(mocks.get).toHaveBeenCalledWith('/api/rewards/badges');
        expect([...container.querySelectorAll('li')].map(row => row.style.animationDelay)).toEqual(['0ms', '120ms', '240ms', '360ms', '480ms', '600ms', '720ms']);
        expect(savedReviewOutcome('a', { id: 'record', result: 'correct', reviewPlan: { nextReviewAt: null }, rewards: outcomes[0].rewards } as Parameters<typeof savedReviewOutcome>[1])?.rewards).toEqual(outcomes[0].rewards);
    });
    it('summary 失败只保留会话明细和会话合计，不展示余额或结算', async () => {
        mocks.get.mockRejectedValue(new Error('离线'));
        await render(<ReviewRewards outcomes={outcomes} startedAt="2026-11-11T04:00:00Z" />);
        expect(container.textContent).toContain('合计 12 颗'); expect(container.textContent).not.toContain('现在一共'); expect(container.querySelector('[role="alert"]')).toBeNull();
    });
    it('关闭奖励不显示区块', async () => {
        mocks.get.mockResolvedValue({ ...summary, enabled: false }); await render(<ReviewRewards outcomes={outcomes} />); expect(container.innerHTML).toBe('');
    });
});

describe('奖励设置与记录', () => {
    it('周目标和开关走 PATCH，保存成功回调刷新余额', async () => {
        mocks.get.mockResolvedValue({}); mocks.patch.mockResolvedValue({ weeklyGoalDays: 5, rewardsEnabled: false }); const onSaved = vi.fn();
        await render(<RewardSettings onSaved={onSaved} />);
        expect(button('4 天').getAttribute('aria-pressed')).toBe('true');
        await act(async () => { button('5 天').click(); container.querySelector<HTMLButtonElement>('[role="switch"]')!.click(); });
        await act(async () => button('保存').click());
        expect(mocks.patch).toHaveBeenCalledWith('/api/user', { weeklyGoalDays: 5, rewardsEnabled: false }); expect(onSaved).toHaveBeenCalledOnce();
        expect(button('保存').disabled).toBe(true); expect(container.querySelector('#rewards')).toBeTruthy();
    });
    it('保存失败保留选择，可重试', async () => {
        mocks.get.mockResolvedValue({ weeklyGoalDays: 3, rewardsEnabled: false }); mocks.patch.mockRejectedValue(new Error('离线'));
        await render(<RewardSettings />); await act(async () => button('4 天').click()); await act(async () => button('保存').click());
        expect(button('4 天').getAttribute('aria-pressed')).toBe('true'); expect(button('保存').disabled).toBe(false); expect(container.textContent).toContain('保存设置失败');
    });
    it('只对选中日请求 ledger，零所得显示破折号', async () => {
        const day = { date: '2026-11-11', records: [], summary: { total: 0, correct: 0, wrong: 0, notAttempted: 0, reviewDurationSec: 0 } };
        await render(<HistoryDayList day={day} selectedRecord="" onSelect={vi.fn()} />); expect(mocks.get).not.toHaveBeenCalled();
        mocks.get.mockResolvedValue({ day: day.date, points: 0, entries: [] });
        await render(<HistoryDayList day={day} selectedRecord="" onSelect={vi.fn()} showRewards />);
        expect(mocks.get).toHaveBeenCalledWith('/api/rewards/ledger?day=2026-11-11'); expect(container.textContent).toContain('—'); expect(container.textContent).not.toContain('0 颗');
    });
    it('我的周所得取自汇总且不逐日查账，禁用时不渲染', async () => {
        await render(<MeRewards rewards={state()} />);
        expect(container.textContent).toContain('本周 13 颗'); expect(mocks.get).not.toHaveBeenCalled();
        await render(<MeRewards rewards={state({ ...summary, enabled: false })} />); expect(container.innerHTML).toBe('');
    });
});
