import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewPage from '@/app/review/page';
import { LanguageProvider } from '@/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get } }));
let root: Root;
let container: HTMLDivElement;
const budget = { dailyMinutes: 30, consumedMinutes: 0, remainingMinutes: 30, estimatedMinutes: 25, tomorrowMinutes: 18, todayDurationSec: 0, todayReviewed: 0, backlogHint: false, dayKey: 'u:2026-11-08' };
const items = Array.from({ length: 25 }, (_, index) => ({
    id: String(index), estimatedSec: 60, questionPreview: `题干 ${index}`, nextReviewAt: '2026-11-08T00:00:00Z',
    subjectId: index < 15 ? 'math' : 'english', subjectName: index < 15 ? '数学' : '英语',
}));
async function render() { await act(async () => root.render(<LanguageProvider><ReviewPage /></LanguageProvider>)); }
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.setItem('language', 'zh'); sessionStorage.clear();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    mocks.get.mockReset().mockResolvedValue({ ...budget, items });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('复习首页', () => {
    it('主卡显示分钟、完整队列和准确科目题数，标签直接开始该科，列表默认收起', async () => {
        await render();
        expect(mocks.get).toHaveBeenCalledWith('/api/review/due?format=overview');
        expect(container.querySelector('select')).toBeNull();
        const start = [...container.querySelectorAll('a')].find(node => node.textContent === '开始复习')!;
        expect(start.getAttribute('href')).toBe('/review/session?autostart=1');
        expect(container.textContent).toContain('25 题'); expect(container.textContent).toContain('15 题'); expect(container.textContent).toContain('10 题');
        const subject = [...container.querySelectorAll('a')].find(node => node.textContent === '数学')!;
        expect(subject.getAttribute('href')).toBe('/review/session?subjectId=math&autostart=1');
        expect(container.querySelector('details')?.open).toBe(false);
        expect(container.querySelectorAll('ol li')).toHaveLength(25);
        expect(container.textContent).toContain('约 25 分钟');
        expect(container.textContent).toContain('明天约 18 分钟');
        expect(container.querySelector('ol a')?.getAttribute('href')).toBe('/error-items/0');
        for (const text of ['复习中', '做错了', '第 1 / 6 轮', '举一反三', '间隔', '默认 20']) expect(container.textContent).not.toContain(text);
    });
    it('科目使用不同主题色，题目顺序变化不会改变相同科目的颜色', async () => {
        await render();
        const colors = () => new Map([...container.querySelectorAll('section ul li')].map(row => [row.children[1].textContent, row.children[0].className]));
        const initial = colors();
        expect(new Set(initial.values()).size).toBe(2);
        expect([...initial.values()].every(color => color.includes('bg-chart-'))).toBe(true);
        await act(async () => root.unmount()); root = createRoot(container);
        mocks.get.mockResolvedValueOnce({ ...budget, items: [...items].reverse() }); await render();
        expect(colors()).toEqual(initial);
    });
    it('没有到期题时不显示题量、科目标签或开始按钮', async () => {
        mocks.get.mockResolvedValueOnce({ ...budget, items: [] }); await render();
        expect(container.textContent).toContain('今天没有需要复习的错题');
        expect(container.querySelector('a')).toBeNull(); expect(container.querySelector('select')).toBeNull();
        expect(container.querySelector('details')).toBeNull(); expect(container.textContent).not.toContain('25 题');
    });
    it('完成后返回且已无到期题时展示完成状态，不显示开始入口', async () => {
        sessionStorage.setItem('review-completed', '2'); mocks.get.mockResolvedValueOnce({ ...budget, todayReviewed: 2, todayDurationSec: 125, items: [] }); await render();
        expect(container.textContent).toContain('今天的复习完成了');
        expect(container.textContent).toContain('本日用时 2 分 5 秒');
        expect(container.querySelector('a')?.getAttribute('href')).toBe('/review/session?mode=extra&autostart=1');
    });
    it('加载失败可重试，重试期间保持加载提示', async () => {
        mocks.get.mockRejectedValueOnce(new Error('离线')); await render();
        expect(container.querySelector('[role="alert"]')).toBeTruthy();
        await act(async () => container.querySelector('button')!.click());
        expect(container.querySelector('[role="alert"]')).toBeNull(); expect(container.querySelector('details')).toBeTruthy();
    });
    it('返回首页后显示已完成题数提示，不存新的用户偏好', async () => {
        sessionStorage.setItem('review-completed', '3'); await render();
        expect(container.textContent).toContain('本次已完成 3 题'); expect(sessionStorage.getItem('review-completed')).toBeNull();
    });
    it('积压提示按账户和应用日历日只展示一次，不显示积压数量', async () => {
        mocks.get.mockResolvedValueOnce({ ...budget, items, backlogHint: true }); await render();
        expect(container.textContent).toContain('有些题已经往后排了');
        await act(async () => root.unmount()); root = createRoot(container);
        mocks.get.mockResolvedValueOnce({ ...budget, items, backlogHint: true }); await render();
        expect(container.textContent).not.toContain('有些题已经往后排了');
        await act(async () => root.unmount()); root = createRoot(container);
        mocks.get.mockResolvedValueOnce({ ...budget, dayKey: 'u:2026-11-09', items, backlogHint: true }); await render();
        expect(container.textContent).toContain('有些题已经往后排了');
    });

});
