import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadgeStamp } from '@/components/student/badge-stamp';
import { BraveCard } from '@/components/student/brave-card';
import { ProgressRewards } from '@/components/student/progress-rewards';
import { SessionBadges } from '@/components/review/session-badges';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { REWARD_BADGES } from '@/lib/rewards/badges';
import { REWARD_RULES } from '@/lib/rewards/rules';
import { sessionBadgeIds } from '@/lib/rewards/session-badges';
import type { StudentProgress, StudentSticker } from '@/lib/student-progress';
import type { RewardBadgeResponse, RewardSummaryResponse } from '@/types/api';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: mocks }));
const summary: RewardSummaryResponse = { leave: { held: 0, max: 2, usedDay: null, earnedDay: null }, lastStreak: 0, weekly: { reached: false, box: null }, brave: { errorItemId: 'a', difficultyStars: 4, subjectName: '数学', subjectKey: 'math', tags: ['方程', '分式', '函数', '几何'], preview: '试着解开这道难题', done: false, result: null }, recentBadges: [], badgeCount: 0, balance: 0, today: { day: '2026-11-11', entries: [], points: 0 }, week: { start: '2026-11-09', goalDays: 4, points: 0, completedDays: [] }, streak: 0, reviewedToday: false, enabled: true, rulesVersion: 1 };
const state = (data: RewardSummaryResponse | null = summary, loading = false, error = false) => ({ data, loading, error, reload: vi.fn() });
const sticker: StudentSticker = { key: 'a', name: '方程', subjectId: 'math', subjectName: '数学', subjectKey: 'math', tagSet: 'default', state: 'earned', itemIds: [], total: 1, remaining: 0, earnedDay: '2026-11-11' };
const progress: StudentProgress = { stickers: [], earned: 0, leaveDays: [], weeklyNew: [], streak: 0, reviewedToday: false, day: '2026-11-11', items: {} };
const startedAt = '2026-11-11T04:00:00Z';
const badgeRecord = (id: string, createdAt: string): RewardBadgeResponse => ({ id, createdAt, category: 'persistence', hidden: false, earned: true, day: '2026-10-01', backfilled: false });
let root: Root;
let container: HTMLDivElement;
async function render(node: ReactNode) { await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>)); }
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.get.mockReset().mockResolvedValue({ badges: [] });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); document.documentElement.removeAttribute('data-ui'); vi.unstubAllGlobals(); });

describe('今天的勇者题', () => {
    it('未做显示星级、科目、最多三个标签、题干与自愿入口，点数取自规则', async () => {
        await render(<BraveCard rewards={state()} />);
        expect(container.textContent).toContain('今天的勇者题');
        expect(container.querySelector('[aria-label="4 星难题"]')?.querySelectorAll('svg')).toHaveLength(4);
        expect(container.textContent).toContain('数学方程分式函数');
        expect(container.textContent).not.toContain('几何');
        expect(container.querySelector('.line-clamp-2')?.textContent).toBe(summary.brave?.preview);
        expect(container.textContent).toContain(`做错也有 ${REWARD_RULES.brave.points} 颗能量豆`);
        expect(container.querySelector('a')?.getAttribute('href')).toBe('/review/session?mode=brave&autostart=1');
        expect(container.querySelector('a')?.classList.contains('min-h-11')).toBe(true);
        expect(container.querySelector('[data-subject="math"]')).toBeTruthy();
    });
    it.each(['correct', 'wrong'] as const)('已做 %s 卡片保留，显示结果章并移除按钮', async result => {
        await render(<BraveCard rewards={state({ ...summary, brave: { ...summary.brave!, done: true, result } })} />);
        expect(container.textContent).toContain('今天的勇者题做过啦');
        expect(container.querySelector('a')).toBeNull();
        expect(container.querySelector(`[data-stamp="${result === 'correct' ? 'correct' : 'almost'}"]`)).toBeTruthy();
        expect(container.textContent?.includes('勇者也会摔跤，明天再见')).toBe(result === 'wrong');
    });
    it('空、失败和禁用均隐藏；加载保留与卡片同高的骨架', async () => {
        await render(<BraveCard rewards={state(null, true)} />);
        expect(container.querySelector('.min-h-72 [aria-busy="true"]')).toBeTruthy();
        for (const rewards of [state({ ...summary, brave: null }), state(summary, false, true), state({ ...summary, enabled: false }, true)]) {
            await render(<BraveCard rewards={rewards} />); expect(container.innerHTML).toBe('');
        }
        await render(<BraveCard rewards={state(null, true)} enabled={false} />); expect(container.innerHTML).toBe('');
    });
});

describe('成就印章', () => {
    it('已获得有章下名称与独立图案，普通未获得显示条件，隐藏未获得仅显示问号与神秘成就', async () => {
        await render(<BadgeStamp badgeId="streak-7" earned size="sm" />);
        expect(container.querySelector('[data-size="sm"][data-earned="true"]')).toBeTruthy();
        expect(container.textContent).toBe('一周');
        expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('一周');
        expect(container.querySelector('[role="img"]')?.textContent).toBe('');
        expect(container.querySelector('svg')).toBeTruthy();
        await render(<BadgeStamp badgeId="streak-7" earned={false} />);
        expect(container.textContent).toContain('连续复习 7 天');
        expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('一周');
        expect(container.querySelector('g[opacity="0.35"]')).toBeTruthy();
        await render(<BadgeStamp badgeId="early-bird" earned={false} />);
        expect(container.textContent).toBe('神秘成就');
        expect(container.querySelector('svg circle[stroke-dasharray]')).toBeTruthy();
        expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('神秘成就');
        expect(container.innerHTML).not.toContain('早起鸟');
        expect(container.innerHTML).not.toContain('7 点');
        await render(<BadgeStamp badgeId="early-bird" earned />);
        expect(container.textContent).toBe('早起鸟');
    });
    it('只有显式新获得才添加动画；简洁、减少动画与深色用现有样式边界', async () => {
        document.documentElement.dataset.ui = 'simple';
        await render(<BadgeStamp badgeId="streak-1" earned />);
        expect(container.querySelector('.student-badge-new')).toBeNull();
        await render(<BadgeStamp badgeId="streak-1" earned animate />);
        expect(container.querySelector('.student-badge-new')).toBeTruthy();
        // JSDOM 不计算媒体规则，核对动画只在手账屏幕边界内定义，减少动画同时取消旋转。
        const css = readFileSync('src/components/student/student.css', 'utf8');
        expect(css).toContain(':root[data-ui="notebook"] .student-badge-new { animation: badge-stamp-in 300ms');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toContain('.student-badge { transform: none; animation: none; }');
    });
});

describe('这周新收获', () => {
    it.each([[true, false], [false, true], [true, true], [false, false]])('贴纸 %s / 成就 %s 按需显示两排', async (stickers, badges) => {
        await render(<ProgressRewards data={{ ...progress, weeklyNew: stickers ? [sticker] : [] }} recentBadges={badges ? [{ id: 'streak-1', day: progress.day, createdAt: startedAt }] : []} />);
        expect(!!container.querySelector('section')).toBe(stickers || badges);
        expect(!!container.querySelector('.student-sticker')).toBe(stickers);
        expect(!!container.querySelector('[data-badge-id]')).toBe(badges);
        if (badges) expect(container.querySelector('a[href="/collection?tab=badges"]')).toBeTruthy();
        if (stickers || badges) expect(container.textContent).toContain('这周新收获');
    });
    it('只有成就时不依赖贴纸进度，关闭奖励时全部隐藏', async () => {
        const badges = [{ id: 'streak-1', day: progress.day, createdAt: startedAt }];
        await render(<ProgressRewards recentBadges={badges} />); expect(container.querySelector('[data-badge-id]')).toBeTruthy();
        await render(<ProgressRewards data={{ ...progress, weeklyNew: [sticker] }} recentBadges={badges} enabled={false} />); expect(container.innerHTML).toBe('');
    });
});

describe('本次新成就', () => {
    it('按 createdAt 严格晚于开始筛选、过滤其他账目与未知 id，去重且不依赖历史 day', () => {
        const entries = ['streak-1', 'unknown'].map(badgeId => ({ type: 'badge', meta: { badgeId }, points: 0, createdAt: '2026-11-11T04:01:00Z' }));
        expect(sessionBadgeIds([...entries, { ...entries[0], type: 'review', meta: { badgeId: 'streak-100' } }], [badgeRecord('streak-1', '2026-11-11T04:01:00Z'), badgeRecord('streak-3', startedAt), badgeRecord('streak-7', '2026-11-11T03:59:59Z'), badgeRecord('brave-1', '2026-11-11T04:02:00Z')], startedAt)).toEqual(['streak-1', 'brave-1']);
        expect(sessionBadgeIds(entries, [], undefined)).toEqual([]);
        expect(sessionBadgeIds(entries, [], 'bad-date')).toEqual([]);
    });
    it('补读成就全集展示历史日的新入账成就；刷新同一章不重新挂载，失败保留已知章', async () => {
        mocks.get.mockResolvedValue({ badges: [badgeRecord('streak-1', '2026-11-11T04:01:00Z')] });
        await render(<SessionBadges summary={summary} startedAt={startedAt} />);
        expect(mocks.get).toHaveBeenCalledWith('/api/rewards/badges');
        const stamp = container.querySelector('.student-badge-new'); expect(stamp).toBeTruthy();
        await render(<SessionBadges summary={{ ...summary }} startedAt={startedAt} />);
        expect(container.querySelector('.student-badge-new')).toBe(stamp);
        const withBadge = { ...summary, today: { ...summary.today, entries: [{ type: 'badge', points: 0, createdAt: '2026-11-11T04:01:00Z', meta: { badgeId: 'streak-1' } }] } };
        mocks.get.mockRejectedValue(new Error('离线'));
        await render(<SessionBadges summary={withBadge} startedAt={startedAt} />);
        expect(container.textContent).toContain('新成就'); expect(container.querySelector('[role="alert"]')).toBeNull();
        await render(<SessionBadges summary={null} startedAt={startedAt} />); expect(container.innerHTML).toBe('');
    });
    it('无新章或没有开始时刻不显示，也不额外查询', async () => {
        await render(<SessionBadges summary={summary} />); expect(mocks.get).not.toHaveBeenCalled(); expect(container.innerHTML).toBe('');
        expect(REWARD_BADGES).toHaveLength(16);
    });
});
