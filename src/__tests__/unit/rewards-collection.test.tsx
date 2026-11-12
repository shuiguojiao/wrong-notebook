import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadgeCollection, BadgeCollectionContent } from '@/components/student/badge-collection';
import { CollectionPage } from '@/components/student/collection-page';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { REWARD_BADGES } from '@/lib/rewards/badges';
import type { RewardBadgeResponse } from '@/types/api';

const mocks = vi.hoisted(() => ({ get: vi.fn(), replace: vi.fn(), search: '' }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => new URLSearchParams(mocks.search) }));
const badges: RewardBadgeResponse[] = REWARD_BADGES.map((badge, index) => ({ ...badge, earned: index < 2, day: index < 2 ? '2026-11-09' : null, createdAt: index < 2 ? '2026-11-11T04:00:00Z' : null, backfilled: index === 1 }));
let container: HTMLDivElement;
let root: Root;
async function render(node: ReactNode) { await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>)); }
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.search = ''; mocks.replace.mockReset(); mocks.get.mockReset().mockImplementation(async (url: string) => {
        if (url === '/api/user') return { rewardsEnabled: true };
        if (url === '/api/rewards/badges') return { badges };
        if (url === '/api/rewards/fun-stickers') return { stickers: [], sets: [] };
        return { stickers: [], earned: 0, items: {}, weeklyNew: [] };
    });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('成就收集册', () => {
    it('十六章按四类分组、计数含回填；日期显示应用日，隐藏章不泄露条件', async () => {
        await render(<BadgeCollectionContent badges={badges} />);
        expect(container.textContent).toContain('已获得 2 / 16 枚');
        expect([...container.querySelectorAll('h2')].map(heading => heading.textContent)).toEqual(['坚持', '勇气', '改正', '隐藏']);
        expect([...container.querySelectorAll('ul')].map(list => list.children.length)).toEqual([6, 3, 4, 3]);
        expect(container.querySelectorAll('[data-size="md"]')).toHaveLength(16);
        expect(container.textContent).toContain('11月9日获得'); expect(container.textContent).toContain('之前获得');
        expect(container.textContent).not.toContain('早上 7 点');
        expect(container.querySelectorAll('[aria-label="神秘成就"]')).toHaveLength(3);
        expect(container.querySelector('ul')?.classList.contains('grid-cols-2')).toBe(true);
        expect(container.querySelector('ul')?.classList.contains('sm:grid-cols-3')).toBe(true);
    });
    it('加载骨架、失败可重试，重试成功展示真实计数', async () => {
        let resolve: (value: { badges: RewardBadgeResponse[] }) => void = () => {};
        mocks.get.mockReturnValue(new Promise(value => { resolve = value; }));
        await render(<BadgeCollection />);
        expect(container.querySelector('[aria-busy="true"]')).toBeTruthy(); expect(container.textContent).not.toContain('已获得');
        await act(async () => resolve({ badges })); expect(container.textContent).toContain('已获得 2 / 16 枚');
        await act(async () => root.unmount()); root = createRoot(container);
        mocks.get.mockRejectedValueOnce(new Error('离线')).mockResolvedValue({ badges });
        await render(<BadgeCollection />); expect(container.querySelector('[role="alert"]')).toBeTruthy();
        await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
        expect(container.querySelector('[role="alert"]')).toBeNull(); expect(container.textContent).toContain('已获得 2 / 16 枚');
    });
    it('默认知识点页，Radix 切换写入 URL，刷新可直达成就，返回默认页保留其他参数', async () => {
        await render(<CollectionPage />);
        expect(container.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe('知识点贴纸');
        expect(mocks.get).not.toHaveBeenCalledWith('/api/rewards/badges');
        const badgeTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(tab => tab.textContent === '成就')!;
        await act(async () => badgeTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
        expect(mocks.replace).toHaveBeenCalledWith('/collection?tab=badges', { scroll: false });
        mocks.search = 'tab=badges&point=test';
        await render(<CollectionPage />);
        expect(container.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe('成就');
        expect(container.querySelector('[role="tabpanel"][data-state="active"]')?.textContent).toContain('已获得 2 / 16 枚');
        const stickerTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(tab => tab.textContent === '知识点贴纸')!;
        await act(async () => stickerTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
        expect(mocks.replace).toHaveBeenCalledWith('/collection?point=test', { scroll: false });
        await act(async () => root.unmount()); root = createRoot(container);
        await render(<CollectionPage />); expect(container.textContent).toContain('已获得 2 / 16 枚');
    });
    it('第三页签切换写入 fun，刷新可直达并显示计数', async () => {
        await render(<CollectionPage />);
        const tab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(item => item.textContent === '趣味贴纸')!;
        await act(async () => tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
        expect(mocks.replace).toHaveBeenCalledWith('/collection?tab=fun', { scroll: false });
        mocks.search = 'tab=fun'; await render(<CollectionPage />);
        expect(container.textContent).toContain('已收集 0 / 36 张');
        expect(container.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe('趣味贴纸');
        await act(async () => root.unmount()); root = createRoot(container); await render(<CollectionPage />);
        expect(container.textContent).toContain('已收集 0 / 36 张');
    });
    it.each(['badges', 'fun'])('奖励禁用时 URL 指向 %s 也隐藏页签，保留知识点内容', async tab => {
        mocks.search = `tab=${tab}`;
        mocks.get.mockImplementation(async (url: string) => url === '/api/user' ? { rewardsEnabled: false } : { stickers: [], earned: 0, items: {}, weeklyNew: [] });
        await render(<CollectionPage />);
        expect(container.querySelector('[role="tablist"]')).toBeNull(); expect(container.querySelector('[data-badge-id]')).toBeNull();
        expect(container.textContent).toContain('还没有知识点'); expect(mocks.get).not.toHaveBeenCalledWith('/api/rewards/badges'); expect(mocks.get).not.toHaveBeenCalledWith('/api/rewards/fun-stickers');
    });
});
