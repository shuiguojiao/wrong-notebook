import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewPage from '@/app/review/page';
import { LanguageProvider } from '@/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/hooks/use-stats-data', () => ({ useStatsData: () => ({ data: null, loading: false, error: false }) }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (url: string, ...args: unknown[]) => url === '/api/checks/pending' ? Promise.resolve({ total: 0, items: [] }) : mocks.get(url, ...args) } }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { name: '小林' } } }) }));
vi.mock('@/components/student/today-task-status', () => ({ TodayTaskStatus: () => null }));
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
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })); localStorage.setItem('app-language', 'zh'); sessionStorage.clear();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    mocks.get.mockReset().mockImplementation(async (url: string) => url === '/api/notebooks' ? [] : { ...budget, items });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('复习首页', () => {
    it('概览新字段传递到今日题目列表并渲染公式', async () => {
        queueOnce({ ...budget, items: [{ ...items[0], questionPreview: '旧公式摘要', questionPreviewMarkdown: '计算 $\\frac{1}{2}+x_1^2$' }] });
        await render();
        const link = container.querySelector('ol a')!;
        expect(link.querySelector('.katex')).not.toBeNull();
        expect(link.textContent).not.toContain('旧公式摘要');
        expect(link.getAttribute('href')).toBe('/error-items/0');
    });
    it('便签显示同源分钟与科目题数，整行进入单科，手机清单收起且可展开前六题及全部', async () => {
        await render();
        expect(mocks.get).toHaveBeenCalledWith('/api/review/due?format=overview');
        expect(container.querySelector('select')).toBeNull();
        expect(container.textContent).not.toContain('只复习某一科');
        expect(container.textContent).not.toContain('需要看一眼');
        const start = [...container.querySelectorAll('a')].find(node => node.textContent === '开始复习')!;
        expect(start.getAttribute('href')).toBe('/review/session?autostart=1');
        expect([...container.querySelectorAll('a')].filter(node => node.textContent === '开始复习')).toHaveLength(1);
        expect(container.textContent).toContain('今天要复习'); expect(container.textContent).toContain('15 题'); expect(container.textContent).toContain('10 题');
        expect(container.querySelector('[aria-label="已复习 0 题，应复习 15 题"]')?.textContent).toBe('0/15');
        expect(container.querySelector('[aria-label="已复习 0 题，应复习 10 题"]')?.textContent).toBe('0/10');
        const subject = [...container.querySelectorAll('a')].find(node => node.textContent?.startsWith('数学'))!;
        expect(subject.getAttribute('href')).toBe('/review/session?subjectId=math&autostart=1');
        expect(container.querySelector('details')?.open).toBe(false);
        expect(container.querySelectorAll('ol li')).toHaveLength(6);
        await act(async () => [...container.querySelectorAll('button')].find(node => node.textContent === '查看全部 25 题')!.click());
        expect(container.querySelectorAll('ol li')).toHaveLength(25);
        expect(container.querySelector('h1')?.textContent).toBe('小林，今天 25 分钟 搞定');
        expect(container.querySelector('mark')?.textContent).toBe('25 分钟');
        expect(container.querySelector('summary')?.textContent).toBe('看看是哪 25 题');
        expect(container.textContent?.match(/看看是哪 25 题/g)).toHaveLength(1);
        expect([...container.querySelectorAll('button')].some(node => node.textContent === '看看是哪 25 题')).toBe(false);
        expect(container.textContent).toContain('明天约 18 分钟');
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
    it('科目进度显示已复习与应复习数，完成后显示对勾与完成，整行入口保持不变', async () => {
        queueOnce({ ...budget, items: items.slice(0, 2), reviewedSubjects: [
            { subjectId: 'math', subjectName: '数学', count: 1 },
            { subjectId: 'english', subjectName: '英语', count: 3 },
        ] });
        await render();
        const done = container.querySelector('[role="img"][aria-label="完成"]')!;
        expect(done.textContent).toBe('完成');
        expect(done.querySelector('svg')).not.toBeNull();
        const pending = container.querySelector('[role="img"][aria-label="已复习 1 题，应复习 3 题"]')!;
        expect(pending.textContent).toBe('1/3');
        expect(pending.querySelector('svg')).toBeNull();
        expect(pending.closest('a')?.getAttribute('href')).toBe('/review/session?subjectId=math&autostart=1');
        expect(container.querySelector('input[type="checkbox"]')).toBeNull();
        expect(container.querySelector('section ul')?.textContent).toContain('英语 · 3 题完成');
        expect(container.querySelector('a[href*="subjectId=english"]')).toBeNull();
    });
    it('平板清单默认展开前六题，便签按钮同步折叠与展开', async () => {
        vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
        await render();
        expect(container.querySelector('details')?.open).toBe(true);
        expect(container.querySelectorAll('ol li')).toHaveLength(6);
        const toggle = [...container.querySelectorAll('button')].find(node => node.textContent === '看看是哪 25 题')!;
        await act(async () => toggle.click());
        expect(container.querySelector('details')?.open).toBe(false);
        await act(async () => toggle.click());
        expect(container.querySelector('details')?.open).toBe(true);
    });
    it('没有到期题时不显示题量、科目标签或开始按钮', async () => {
        queueOnce({ ...budget, items: [] }); await render();
        expect(container.textContent).toContain('今天没有需要复习的错题');
        expect(container.querySelector('a')?.getAttribute('href')).toBe('/'); expect(container.querySelector('select')).toBeNull();
        expect(container.querySelector('details')).toBeNull(); expect(container.textContent).not.toContain('25 题');
    });
    it('完成后返回且已无到期题时展示完成状态，不显示开始入口', async () => {
        sessionStorage.setItem('review-completed', '2'); queueOnce({ ...budget, todayReviewed: 2, todayDurationSec: 125, items: [] }); await render();
        expect(container.textContent).toContain('今天的错题清空啦');
        expect(container.textContent).toContain('2 题 · 用了 3 分钟');
        expect(container.querySelector('a[href*="mode=extra"]')?.getAttribute('href')).toBe('/review/session?mode=extra&autostart=1');
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
