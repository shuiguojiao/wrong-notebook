import { act, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryJournal } from '@/components/history/history-journal';
import { ReviewRewards } from '@/components/review/review-rewards';
import { FunStickerCollection, FunStickerCollectionContent } from '@/components/student/fun-sticker-collection';
import { MeRewards } from '@/components/student/me-rewards';
import { ProgressRewards, StreakReward } from '@/components/student/progress-rewards';
import { TodayJournal } from '@/components/student/today-journal';
import { WeeklyBox } from '@/components/student/weekly-box';
import { WeeklyJournal, WeeklyJournalContent } from '@/components/student/weekly-journal';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { FUN_STICKERS } from '@/lib/rewards/fun-stickers';
import { computeStudentProgress } from '@/lib/student-progress';
import type { RewardEntryResponse, RewardFunStickersResponse, RewardSummaryResponse, RewardWeekResponse } from '@/types/api';

const mocks = vi.hoisted(() => ({ get: vi.fn(), style: 'notebook', reduced: false }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get } }));
vi.mock('@/lib/frontend-logger', () => ({ frontendLogger: { error: vi.fn() } }));
vi.mock('@/contexts/UiStyleContext', () => ({ useUiStyle: () => ({ style: mocks.style }) }));
const box = { stickerId: 'tech-robot', setCompleted: null, points: 0, createdAt: '2026-11-11T04:01:00Z' };
const summary: RewardSummaryResponse = {
    leave: { held: 1, max: 2, usedDay: null, earnedDay: null }, lastStreak: 12,
    weekly: { reached: true, box }, brave: null, recentBadges: [], badgeCount: 0,
    balance: 100, today: { day: '2026-11-11', points: 0, entries: [] },
    week: { start: '2026-11-09', goalDays: 4, points: 30, completedDays: [] },
    streak: 0, reviewedToday: false, rulesVersion: 1, enabled: true,
};
const progress = computeStudentProgress([], .5, new Date('2026-11-11T04:00:00Z'), 'Asia/Shanghai');
const week: RewardWeekResponse = {
    start: '2026-11-02', end: '2026-11-08', reviewDays: 4, goalDays: 4, goalReached: true,
    answered: 8, corrections: 3, braveAnswers: 2, beans: 40, badges: ['streak-3'],
    stickers: ['函数'], funStickers: ['tech-robot'],
    bravest: { errorItemId: 'q1', difficultyStars: 5, result: 'wrong', preview: '计算 $x^2$', subjectName: '数学', day: '2026-11-08' }, empty: false,
};
const fun: RewardFunStickersResponse = { stickers: FUN_STICKERS.map(sticker => ({ ...sticker, owned: sticker.setId === 'history', day: sticker.setId === 'history' ? '2026-11-09' : null })), sets: [{ setId: 'history', completed: true }] };
let root: Root;
let container: HTMLDivElement;
let observe: IntersectionObserverCallback;
async function render(node: ReactNode) { await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>)); }
async function remount(node: ReactNode) { await act(async () => root.unmount()); root = createRoot(container); await render(node); }
function button(text: string, parent: ParentNode = container) { return [...parent.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === text)!; }
async function intersect(visible: boolean) { await act(async () => observe([{ isIntersecting: visible } as IntersectionObserverEntry], {} as IntersectionObserver)); }
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.style = 'notebook'; mocks.reduced = false;
    mocks.get.mockReset().mockImplementation(async (url: string) => url.includes('fun-stickers') ? fun : url.includes('/week?') ? week : url.includes('/badges') ? { badges: [] } : summary);
    vi.stubGlobal('matchMedia', () => ({ matches: mocks.reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal('IntersectionObserver', class { constructor(callback: IntersectionObserverCallback) { observe = callback; } observe() {} disconnect() {} });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('请假卡与温和归零', () => {
    it('角标读屏、最近连续与浅色重新开始，不展示零；无上次连续时保持原样', async () => {
        await render(<StreakReward data={progress} summary={summary} />);
        expect(container.textContent).toContain('假×1'); expect(container.querySelector('[aria-label="有 1 张请假卡"]')).toBeTruthy();
        expect(container.querySelector('[data-restart="true"]')?.textContent).toBe('重新开始'); expect(container.textContent).toContain('上次连续 12 天');
        await render(<StreakReward data={progress} summary={{ ...summary, lastStreak: 0 }} />);
        expect(container.querySelector('[data-restart]')).toBeNull(); expect(container.querySelector('.student-streak-number')?.textContent).toBe('0');
        await render(<StreakReward data={progress} summary={{ ...summary, enabled: false }} />);
        expect(container.textContent).not.toContain('假×'); expect(container.textContent).not.toContain('重新开始');
    });
    it('用卡优先，两条日期提示每台设备只显示一次，StrictMode 重放也不提前隐藏', async () => {
        const node = <StreakReward data={progress} summary={{ ...summary, leave: { ...summary.leave, usedDay: '2026-11-10', earnedDay: '2026-11-11' } }} />;
        await render(<StrictMode>{node}</StrictMode>); expect(container.textContent).toContain('用了一张请假卡，连续还在'); expect(container.textContent).not.toContain('连续 7 天');
        await remount(node); expect(container.querySelector('[role="status"]')).toBeNull();
    });
    it('得卡提示一次，新日期重新提示，存储读写异常仍可渲染', async () => {
        const node = <StreakReward data={progress} summary={{ ...summary, leave: { ...summary.leave, earnedDay: '2026-11-11' } }} />;
        await render(node); expect(container.textContent).toContain('连续 7 天，攒到一张请假卡');
        await remount(node); expect(container.querySelector('[role="status"]')).toBeNull();
        await render(<StreakReward data={progress} summary={{ ...summary, leave: { ...summary.leave, earnedDay: '2026-11-12' } }} />);
        expect(container.textContent).toContain('连续 7 天，攒到一张请假卡');
        vi.stubGlobal('localStorage', { getItem: (key: string) => { if (key.startsWith('rewards:')) throw new Error('存储禁用'); return null; }, setItem: () => { throw new Error('存储禁用'); } });
        await remount(node); expect(container.textContent).toContain('连续 7 天，攒到一张请假卡');
    });
});

describe('盲盒信封与收工', () => {
    it('初始合上不泄露贴纸，点击翻开；重新进入和另一入口共用翻开记录', async () => {
        const node = <WeeklyBox weekStart="2026-11-09" box={box} />;
        await render(node); expect(button('拆开看看').getAttribute('aria-expanded')).toBe('false'); expect(container.textContent).not.toContain('机器人');
        await act(async () => button('拆开看看').click()); expect(container.textContent).toContain('机器人'); expect(container.querySelector('[data-animate="true"]')).toBeTruthy();
        expect(container.querySelector('img')?.getAttribute('loading')).toBe('eager');
        await remount(node); expect(button('拆开看看').getAttribute('aria-expanded')).toBe('true');
        await render(<>{node}<WeeklyBox weekStart="2026-11-09" box={box} /></>); expect(container.querySelectorAll('[data-open="true"]')).toHaveLength(2);
        await render(<WeeklyBox weekStart="2026-11-16" box={box} />); expect(container.querySelector('[data-open="false"]')).toBeTruthy();
    });
    it('进入视口满两秒自动翻开，离开视口取消计时', async () => {
        vi.useFakeTimers(); await render(<WeeklyBox weekStart="2026-11-09" box={box} />);
        await act(async () => vi.advanceTimersByTime(3000)); expect(container.textContent).not.toContain('机器人');
        await intersect(true); await act(async () => vi.advanceTimersByTime(1000)); await intersect(false);
        await act(async () => vi.advanceTimersByTime(3000)); expect(container.textContent).not.toContain('机器人');
        await intersect(true); await act(async () => vi.advanceTimersByTime(2000)); expect(container.textContent).toContain('机器人');
    });
    it.each(['simple', 'reduced'])('%s 直接翻开，集齐套装显示奖励', async mode => {
        mocks.style = mode === 'simple' ? 'simple' : 'notebook'; mocks.reduced = mode === 'reduced';
        await render(<WeeklyBox weekStart="2026-11-09" box={{ ...box, setCompleted: 'tech' }} />);
        expect(container.textContent).toContain('科技集齐啦 +50'); expect(container.querySelector('[data-open="true"]')).toBeTruthy(); expect(container.querySelector('[data-animate="true"]')).toBeNull();
    });
    it('三套集齐后显示实际点数；存储异常不影响点击翻开', async () => {
        vi.stubGlobal('localStorage', { getItem: (key: string) => { if (key.startsWith('rewards:')) throw new Error('存储禁用'); return null; }, setItem: () => { throw new Error('存储禁用'); } });
        await render(<WeeklyBox weekStart="2026-11-09" box={{ ...box, stickerId: null, points: 31 }} />);
        await act(async () => button('拆开看看').click()); expect(container.textContent).toContain('+31 能量豆');
    });
    it('今天没有其他新收获时仍显示周目标纸条，禁用后隐藏', async () => {
        await render(<ProgressRewards summary={summary} />); expect(container.textContent).toContain('本周目标达成！');
        await render(<ProgressRewards summary={{ ...summary, enabled: false }} enabled={false} />); expect(container.innerHTML).toBe('');
    });
    it('收工周奖、集齐和盲盒读取实际账目，只算会话开始后的记录', async () => {
        const entry = (type: string, points: number, createdAt = box.createdAt): RewardEntryResponse => ({ type, points, createdAt, meta: {} });
        mocks.get.mockResolvedValue({ ...summary, weekly: { reached: true, box: { ...box, setCompleted: 'tech' } }, today: { ...summary.today, entries: [entry('weekly', 30), entry('fun_set', 50), entry('blindbox', 30), entry('weekly', 30, '2026-11-11T03:00:00Z')] } });
        await render(<ReviewRewards outcomes={[]} startedAt="2026-11-11T04:00:00Z" />);
        const rows = [...container.querySelectorAll('li')].map(row => row.textContent);
        expect(rows).toEqual(['本周目标达成 +30', '科技集齐啦 +50', '盲盒 +30']); expect(container.textContent).toContain('合计 110 颗');
        expect(container.querySelector('[aria-label="本周目标达成！"]')).toBeTruthy();
        await render(<ReviewRewards outcomes={[]} startedAt="2026-11-11T05:00:00Z" />); expect(container.querySelectorAll('li')).toHaveLength(0); expect(container.querySelector('[aria-label="本周目标达成！"]')).toBeNull();
    });
});

describe('趣味贴纸与周手账', () => {
    it('三套分组、计数和集齐章；已拥有使用 SVG，未拥有的贴纸不泄露名字和图案', async () => {
        await render(<FunStickerCollectionContent data={fun} />);
        expect(container.textContent).toContain('已收集 12 / 36 张'); expect(container.querySelectorAll('ul')).toHaveLength(3);
        expect([...container.querySelectorAll('ul')].map(list => list.children.length)).toEqual([12, 12, 12]);
        expect(container.textContent).toContain('集齐'); expect(container.textContent).toContain('兵马俑'); expect(container.textContent).not.toContain('机器人');
        expect(container.querySelectorAll('img')).toHaveLength(12);
        expect(container.querySelector('img')?.getAttribute('src')).toBe('/rewards/fun/history-terracotta.svg');
        expect(container.querySelector('img[src="/rewards/fun/tech-robot.svg"]')).toBeNull();
        expect([...container.querySelectorAll('ul')][1].textContent).toBe('?'.repeat(12));
    });
    it('贴纸加载骨架、错误重试成功', async () => {
        let resolve!: (data: RewardFunStickersResponse) => void;
        mocks.get.mockReturnValueOnce(new Promise(value => { resolve = value; }));
        await render(<FunStickerCollection />); expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
        await act(async () => resolve(fun)); expect(container.textContent).toContain('已收集 12');
        mocks.get.mockRejectedValueOnce(new Error('离线'));
        await remount(<FunStickerCollection />); expect(container.querySelector('[role="alert"]')).toBeTruthy();
        await act(async () => button('重新加载').click()); expect(container.textContent).toContain('已收集 12');
    });
    it('完整版显示四格、成果、公式与结果章，整块链接进入题目', async () => {
        await render(<WeeklyJournalContent data={week} />);
        for (const text of ['复习了 4 天', '目标 4 天', '做了 8 题', '改正 3 道', '勇者题 2 道', '这周得到', '函数', '本周最勇敢的一刻', '数学', '11月2日']) expect(container.textContent).toContain(text);
        expect(container.querySelector('.katex')).toBeTruthy(); expect(container.querySelector('a[href="/error-items/q1"]')).toBeTruthy(); expect(container.querySelector('[data-stamp="almost"]')).toBeTruthy();
        expect(container.querySelector('[data-size="sm"]')).toBeTruthy(); expect(container.querySelector('[aria-label="机器人"] img')?.getAttribute('width')).toBe('40');
        await render(<WeeklyJournalContent data={{ ...week, bravest: null }} />); expect(container.textContent).not.toContain('本周最勇敢的一刻');
        await render(<WeeklyJournalContent data={{ ...week, empty: true }} />); expect(container.textContent).toBe('这周没有做题记录');
    });
    it('按指定应用周请求，错误可重试', async () => {
        mocks.get.mockRejectedValueOnce(new Error('离线')); await render(<WeeklyJournal start={week.start} />);
        expect(mocks.get).toHaveBeenCalledWith('/api/rewards/week?start=2026-11-02'); expect(container.querySelector('[role="alert"]')).toBeTruthy();
        await act(async () => button('重新加载').click()); expect(container.textContent).toContain('复习了 4 天');
    });
    it('今天页上周摘要只有四格和完整入口，翻过去后本周不再显示；空周隐藏', async () => {
        await render(<TodayJournal weekStart="2026-11-09" />);
        expect(container.textContent).toContain('做了 8 题'); expect(container.textContent).not.toContain('这周得到'); expect(container.textContent).not.toContain('本周最勇敢的一刻');
        expect(container.querySelector('a')?.getAttribute('href')).toBe('/history?journal=2026-11-02');
        await act(async () => button('翻过去').click()); expect(container.innerHTML).toBe('');
        await remount(<TodayJournal weekStart="2026-11-09" />); expect(container.innerHTML).toBe('');
        mocks.get.mockResolvedValue({ ...week, empty: true }); await render(<TodayJournal weekStart="2026-11-16" />); expect(container.innerHTML).toBe('');
    });
    it('上周摘要首次成功展示即记录已读，不点翻页再进入也不重复；新一周独立记录', async () => {
        await render(<TodayJournal weekStart="2026-11-09" />); expect(container.textContent).toContain('做了 8 题');
        await remount(<TodayJournal weekStart="2026-11-09" />); expect(container.innerHTML).toBe('');
        await render(<TodayJournal weekStart="2026-11-16" />); expect(container.textContent).toContain('做了 8 题');
    });
    it('手账弹层前后切周，以当前应用周为上界；未来和非周一链接不打开', async () => {
        const onChange = vi.fn();
        await render(<HistoryJournal start="2026-11-09" today="2026-11-11" onChange={onChange} />);
        expect(document.querySelector('[role="dialog"]')).toBeTruthy(); expect(button('下一周', document).disabled).toBe(true);
        await act(async () => button('上一周', document).click()); expect(onChange).toHaveBeenLastCalledWith('2026-11-02');
        await render(<HistoryJournal start="2026-11-02" today="2026-11-11" onChange={onChange} />);
        await act(async () => button('下一周', document).click()); expect(onChange).toHaveBeenLastCalledWith('2026-11-09');
        await render(<HistoryJournal start="2026-11-16" today="2026-11-11" onChange={onChange} />); expect(document.querySelector('[role="dialog"]')).toBeNull();
        await render(<HistoryJournal start="2026-11-10" today="2026-11-11" onChange={onChange} />); expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
    it('我的能量豆下方直接打开当前周，禁用后隐藏入口', async () => {
        await render(<MeRewards rewards={{ data: summary, loading: false, error: false, reload: vi.fn() }} />);
        expect(container.querySelector('a[href="/history?journal=2026-11-09"]')?.textContent).toBe('周手账');
        await render(<MeRewards rewards={{ data: { ...summary, enabled: false }, loading: false, error: false, reload: vi.fn() }} />); expect(container.innerHTML).toBe('');
    });
});
