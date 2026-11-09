import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewPage from '@/app/review/page';
import { LanguageProvider } from '@/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (url: string, ...args: unknown[]) => url === '/api/checks/pending' ? Promise.resolve({ total: 0, items: [] }) : mocks.get(url, ...args) } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
let root: Root;
let container: HTMLDivElement;
const budget = { dailyMinutes: 30, consumedMinutes: 0, remainingMinutes: 30, estimatedMinutes: 25, tomorrowMinutes: 18, todayDurationSec: 0, todayReviewed: 0, backlogHint: false, dayKey: 'u:2026-11-08' };
const items = Array.from({ length: 25 }, (_, index) => ({
    id: String(index), estimatedSec: 60, questionPreview: `题干 ${index}`, nextReviewAt: '2026-11-08T00:00:00Z',
    subjectId: index < 15 ? 'math' : 'english', subjectName: index < 15 ? '数学' : '英语',
}));
function queueOnce(value: object) { mocks.get.mockImplementationOnce(async () => []).mockResolvedValueOnce(value); }
async function render() { await act(async () => root.render(<LanguageProvider><ReviewPage /></LanguageProvider>)); }
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.setItem('app-language', 'zh'); sessionStorage.clear();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    mocks.get.mockReset().mockImplementation(async (url: string) => url === '/api/notebooks' ? [] : { ...budget, items });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('复习首页', () => {
    it('主卡显示分钟、完整队列和准确科目题数，整行直接开始该科，列表默认收起', async () => {
        await render();
        expect(mocks.get).toHaveBeenCalledWith('/api/review/due?format=overview');
        expect(container.querySelector('select')).toBeNull();
        expect(container.textContent).not.toContain('只复习某一科');
        expect(container.textContent).not.toContain('需要看一眼');
        const start = [...container.querySelectorAll('a')].find(node => node.textContent === '开始复习')!;
        expect(start.getAttribute('href')).toBe('/review/session?autostart=1');
        expect([...container.querySelectorAll('a')].filter(node => node.textContent === '开始复习')).toHaveLength(1);
        expect(container.textContent).toContain('25 题'); expect(container.textContent).toContain('15 题'); expect(container.textContent).toContain('10 题');
        const subject = [...container.querySelectorAll('a')].find(node => node.textContent?.startsWith('数学'))!;
        expect(subject.getAttribute('href')).toBe('/review/session?subjectId=math&autostart=1');
        expect(container.querySelector('details')?.open).toBe(false);
        expect(container.querySelectorAll('ol li')).toHaveLength(25);
        expect(container.textContent).toContain('约 25 分钟');
        expect(container.querySelector('summary')?.textContent).toBe('明天约 18 分钟·查看今日题目');
        const details = container.querySelector('details')!;
        await act(async () => details.querySelector('summary')!.click());
        expect(details.open).toBe(true);
        expect(container.querySelector('ol a')?.getAttribute('href')).toBe('/error-items/0');
        for (const text of ['复习中', '做错了', '第 1 / 6 轮', '举一反三', '间隔', '默认 20']) expect(container.textContent).not.toContain(text);
    });
    it('依据所有错题本省略共同前缀，卡片与题目列表显示一致', async () => {
        mocks.get.mockImplementation(async (url: string) => url === '/api/notebooks'
            ? [{ name: '小明·数学' }, { name: '小明·英语' }]
            : { ...budget, items: items.map(item => ({ ...item, subjectName: `小明·${item.subjectName}` })) });
        await render();
        expect(container.textContent).not.toContain('小明·');
        expect(container.querySelector('section ul a')?.textContent).toContain('数学');
        expect(container.querySelector('section ul a')?.getAttribute('href')).toBe('/review/session?subjectId=math&autostart=1');
        expect(container.querySelector('ol a')?.textContent).toContain('数学');
    });
    it('队列外错题本没有共同前缀时保留名称', async () => {
        mocks.get.mockImplementation(async (url: string) => url === '/api/notebooks'
            ? [{ name: '小明·数学' }, { name: '小明·英语' }, { name: '语文' }]
            : { ...budget, items: items.map(item => ({ ...item, subjectName: `小明·${item.subjectName}` })) });
        await render();
        expect(container.querySelector('section ul a')?.textContent).toContain('小明·数学');
    });
    it('错题本列表加载失败仍能复习，保留完整名称和编码后的科目参数', async () => {
        mocks.get.mockImplementation(async (url: string) => {
            if (url === '/api/notebooks') throw new Error('离线');
            return { ...budget, items: [{ ...items[0], subjectId: 'math & 中文', subjectName: '小明·数学' }] };
        });
        await render();
        const row = container.querySelector('section ul a')!;
        expect(row.textContent).toContain('小明·数学');
        expect(new URL(row.getAttribute('href')!, 'http://localhost').searchParams.get('subjectId')).toBe('math & 中文');
        expect(container.querySelector('[role="alert"]')).toBeNull();
    });
    it('未分类科目保留统计但不生成错误的筛选入口', async () => {
        queueOnce({ ...budget, items: [{ id: 'legacy', nextReviewAt: null }] });
        await render();
        expect(container.querySelector('section ul')?.textContent).toContain('未分类');
        expect(container.querySelector('section ul a')).toBeNull();
    });
    it('科目使用不同主题色，题目顺序变化不会改变相同科目的颜色', async () => {
        await render();
        const colors = () => new Map([...container.querySelectorAll('section ul li a')].map(row => [row.children[1].textContent, row.children[0].className]));
        const initial = colors();
        expect(new Set(initial.values()).size).toBe(2);
        expect([...initial.values()].every(color => color.includes('bg-chart-'))).toBe(true);
        await act(async () => root.unmount()); root = createRoot(container);
        queueOnce({ ...budget, items: [...items].reverse() }); await render();
        expect(colors()).toEqual(initial);
    });
    it('没有到期题时不显示题量、科目标签或开始按钮', async () => {
        queueOnce({ ...budget, items: [] }); await render();
        expect(container.textContent).toContain('今天没有需要复习的错题');
        expect(container.querySelector('a')).toBeNull(); expect(container.querySelector('select')).toBeNull();
        expect(container.querySelector('details')).toBeNull(); expect(container.textContent).not.toContain('25 题');
    });
    it('完成后返回且已无到期题时展示完成状态，不显示开始入口', async () => {
        sessionStorage.setItem('review-completed', '2'); queueOnce({ ...budget, todayReviewed: 2, todayDurationSec: 125, items: [] }); await render();
        expect(container.textContent).toContain('今天的复习完成了');
        expect(container.textContent).toContain('本日用时 2 分 5 秒');
        expect(container.querySelector('a')?.getAttribute('href')).toBe('/review/session?mode=extra&autostart=1');
    });
    it('加载失败可重试，重试期间保持加载提示', async () => {
        mocks.get.mockImplementationOnce(async () => []).mockRejectedValueOnce(new Error('离线')); await render();
        expect(container.querySelector('[role="alert"]')).toBeTruthy();
        await act(async () => container.querySelector('button')!.click());
        expect(container.querySelector('[role="alert"]')).toBeNull(); expect(container.querySelector('details')).toBeTruthy();
    });
    it('返回首页后显示已完成题数提示，不存新的用户偏好', async () => {
        sessionStorage.setItem('review-completed', '3'); await render();
        expect(container.textContent).toContain('本次已完成 3 题'); expect(sessionStorage.getItem('review-completed')).toBeNull();
    });
    it('积压提示按账户和应用日历日只展示一次，不显示积压数量', async () => {
        queueOnce({ ...budget, items, backlogHint: true }); await render();
        expect(container.textContent).toContain('有些题已经往后排了');
        await act(async () => root.unmount()); root = createRoot(container);
        queueOnce({ ...budget, items, backlogHint: true }); await render();
        expect(container.textContent).not.toContain('有些题已经往后排了');
        await act(async () => root.unmount()); root = createRoot(container);
        queueOnce({ ...budget, dayKey: 'u:2026-11-09', items, backlogHint: true }); await render();
        expect(container.textContent).toContain('有些题已经往后排了');
    });

});
