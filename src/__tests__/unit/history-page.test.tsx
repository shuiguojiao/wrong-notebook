import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryPage } from '@/components/history/history-page';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { TimeZoneProvider } from '@/contexts/TimeZoneContext';
import { formatDateTime } from '@/lib/date-time';
import { historyWeekStart, shiftHistoryDate } from '@/lib/practice-history-view';
import type { PracticeHistoryDay } from '@/types/api';

const mocks = vi.hoisted(() => ({ get: vi.fn(), replace: vi.fn(), search: '', wide: true }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get } }));
vi.mock('@/lib/frontend-logger', () => ({ frontendLogger: { error: vi.fn() } }));
vi.mock('@/lib/page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => new URLSearchParams(mocks.search) }));
let root: Root;
let container: HTMLDivElement;
const today = formatDateTime(new Date(), 'yyyy-MM-dd', 'Asia/Shanghai');
const yesterday = shiftHistoryDate(today, -1);
const day: PracticeHistoryDay = { date: yesterday, summary: { total: 1, correct: 0, wrong: 1, notAttempted: 0, reviewDurationSec: 80 }, records: [
    { id: 'r-old', source: 'review', result: 'wrong', createdAt: `${yesterday}T11:42:00Z`, durationSec: 80, confidence: 'unsure', subjectName: '数学', preview: '计算 $x^2$', hasAnswerImage: false, hasAnswerText: true, errorItemId: 'q1', exam: null },
] };
async function render() { await act(async () => root.render(<LanguageProvider><TimeZoneProvider initialTimeZone="Asia/Shanghai"><HistoryPage /></TimeZoneProvider></LanguageProvider>)); }
async function click(button: HTMLElement) { await act(async () => button.click()); await render(); }
beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.wide = true; mocks.search = '';
    mocks.replace.mockImplementation((url: string) => { mocks.search = url.split('?')[1] ?? ''; });
    vi.stubGlobal('matchMedia', () => ({ matches: mocks.wide, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    mocks.get.mockImplementation(async (url: string) => {
        if (url === '/api/notebooks') return [];
        if (url.includes('/calendar?')) return { days: Array.from({ length: 7 }, (_, index) => ({ date: shiftHistoryDate(historyWeekStart(today), index), total: 0, correct: 0 })) };
        if (url.startsWith('/api/practice/record/')) return { ...day.records[0], questionText: '计算 $x^2$', userAnswer: '答案', hasFigure: false, figureSvg: null, confidence: 'unsure', answerText: '参考答案', analysis: '解析' };
        return { days: [day], hasMore: false, nextBefore: null };
    });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('做题记录页面与地址', () => {
    it('journal 周一直达并打开弹层，切换周更新地址，关闭奖励后完全隐藏', async () => {
        const current = historyWeekStart(today);
        mocks.search = `journal=${current}`;
        const get = mocks.get.getMockImplementation()!;
        mocks.get.mockImplementation((url: string) => {
            if (url === '/api/user') return Promise.resolve({ rewardsEnabled: true });
            if (url.startsWith('/api/rewards/week?')) return Promise.resolve({ empty: true });
            return get(url);
        });
        await render();
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain('这周没有做题记录');
        const previous = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(item => item.textContent === '上一周')!;
        await click(previous);
        expect(new URLSearchParams(mocks.search).get('journal')).toBe(shiftHistoryDate(current, -7));
        expect(mocks.get).toHaveBeenCalledWith(`/api/rewards/week?start=${shiftHistoryDate(current, -7)}`);
        await click(document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="关闭"]')!);
        expect(new URLSearchParams(mocks.search).get('journal')).toBeNull();
        // 关闭奖励的直达链接不挂载手账或发出手账请求。
        await act(async () => root.unmount()); root = createRoot(container);
        mocks.search = `journal=${current}`; mocks.get.mockClear();
        const previousGet = mocks.get.getMockImplementation()!;
        mocks.get.mockImplementation((url: string) => url === '/api/user' ? Promise.resolve({ rewardsEnabled: false }) : previousGet(url));
        await render();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(mocks.get.mock.calls.some(call => String(call[0]).startsWith('/api/rewards/week?'))).toBe(false);
        expect([...container.querySelectorAll('button')].some(item => item.textContent === '本周手账')).toBe(false);
    });
    it('首次没有今天记录时选最近有记录的日期，周条随之切周，小结与列表一致', async () => {
        const recent = shiftHistoryDate(historyWeekStart(today), -2);
        const get = mocks.get.getMockImplementation()!;
        mocks.get.mockImplementation((url: string) => url.startsWith('/api/practice/history?')
            ? Promise.resolve({ days: [{ ...day, date: recent }, { ...day, date: shiftHistoryDate(recent, -1) }], hasMore: false, nextBefore: null }) : get(url));
        await render();
        expect(container.querySelector(`[data-day="${recent}"]`)?.getAttribute('aria-pressed')).toBe('true');
        expect(container.querySelector('aside')?.textContent).toContain('数学 · 做了 1 题');
        expect(container.querySelector('aside')?.textContent).not.toContain('这天没有做题');
        expect(new URLSearchParams(mocks.search).get('date')).toBe(recent);
        expect(mocks.get).toHaveBeenCalledWith(`/api/practice/history/calendar?from=${historyWeekStart(recent)}&to=${shiftHistoryDate(historyWeekStart(recent), 6)}`);
    });
    it('首次今天有记录时选今天', async () => {
        const get = mocks.get.getMockImplementation()!;
        mocks.get.mockImplementation((url: string) => url.startsWith('/api/practice/history?')
            ? Promise.resolve({ days: [{ ...day, date: today }, day], hasMore: false, nextBefore: null }) : get(url));
        await render();
        expect(container.querySelector(`[data-day="${today}"]`)?.getAttribute('aria-pressed')).toBe('true');
        expect(new URLSearchParams(mocks.search).get('date')).toBe(today);
    });
    it.each(['subject', 'wrong'])('切换筛选后当前日期变空则选最新匹配日，清除记录选择（%s）', async filter => {
        const old = shiftHistoryDate(today, -20);
        mocks.search = `date=${old}&record=r-old`;
        const get = mocks.get.getMockImplementation()!;
        mocks.get.mockImplementation((url: string) => {
            if (url === '/api/notebooks') return Promise.resolve([{ id: 'math', name: '数学' }]);
            if (!url.startsWith('/api/practice/history?')) return get(url);
            const query = new URL(url, 'http://localhost').searchParams;
            const filtered = query.has('subjectId') || query.has('result');
            return Promise.resolve({ days: filtered ? query.has('date') ? [] : [day] : [{ ...day, date: old }], hasMore: false, nextBefore: null });
        });
        await render();
        const control = filter === 'subject'
            ? container.querySelector<HTMLButtonElement>('[aria-label="学科"] button:last-child')!
            : container.querySelector<HTMLButtonElement>('[role="switch"]')!;
        await click(control);
        expect(new URLSearchParams(mocks.search).get('date')).toBe(yesterday);
        expect(new URLSearchParams(mocks.search).get('record')).toBeNull();
        expect(container.querySelector(`[data-day="${yesterday}"]`)?.getAttribute('aria-pressed')).toBe('true');
        expect(container.querySelector('aside')?.textContent).toContain('数学 · 做了 1 题');
        const suffix = filter === 'subject' ? '&subjectId=math' : '&result=wrong';
        expect(mocks.get).toHaveBeenCalledWith(`/api/practice/history?days=7${suffix}`);
    });
    it('切换筛选后较早的当前日期仍有记录则保持选择', async () => {
        const old = shiftHistoryDate(today, -20);
        mocks.search = `date=${old}`;
        const get = mocks.get.getMockImplementation()!;
        mocks.get.mockImplementation((url: string) => url.startsWith('/api/practice/history?')
            ? Promise.resolve({ days: [{ ...day, date: old }], hasMore: false, nextBefore: null }) : get(url));
        await render();
        await click(container.querySelector<HTMLButtonElement>('[role="switch"]')!);
        expect(new URLSearchParams(mocks.search).get('date')).toBe(old);
        expect(container.querySelector(`[data-day="${old}"]`)?.getAttribute('aria-pressed')).toBe('true');
        expect(mocks.get).not.toHaveBeenCalledWith('/api/practice/history?days=7&result=wrong');
    });
    it('打开较早记录和关闭详情不重读或重排列表，replace 禁止自动滚动', async () => {
        await render();
        const row = container.querySelector<HTMLButtonElement>('[data-record-id="r-old"]')!;
        await click(row);
        expect(mocks.replace).toHaveBeenLastCalledWith(`/history?date=${yesterday}&record=r-old`, { scroll: false });
        expect(container.querySelector('[data-testid="history-detail"]')).toBeTruthy();
        expect(container.querySelector('[data-record-id="r-old"]')).toBe(row);
        const close = container.querySelector<HTMLButtonElement>('button[aria-label="关闭作答详情，返回当天小结"]')!;
        await click(close);
        expect(container.querySelector('[data-testid="history-detail"]')).toBeNull();
        expect(container.querySelector('[data-record-id="r-old"]')).toBe(row);
        expect(mocks.get.mock.calls.filter(call => String(call[0]).startsWith('/api/practice/history?'))).toHaveLength(1);
    });
    it('横屏详情加载期间关闭会取消选中、回到当天小结，迟到的响应不会重新打开详情', async () => {
        let finish!: (value: unknown) => void;
        const request = new Promise<unknown>(resolve => { finish = resolve; });
        const get = mocks.get.getMockImplementation()!;
        mocks.get.mockImplementation((url: string) => url.startsWith('/api/practice/record/') ? request : get(url));
        mocks.search = `date=${yesterday}&record=r-old`;
        await render();
        expect(container.querySelector('aside [role="status"]')).toBeTruthy();
        const close = container.querySelector<HTMLButtonElement>('button[aria-label="关闭作答详情，返回当天小结"]')!;
        expect(close.textContent).toBe('关闭');
        await click(close);
        expect(new URLSearchParams(mocks.search).get('record')).toBeNull();
        expect(new URLSearchParams(mocks.search).get('date')).toBe(yesterday);
        expect(container.querySelector('aside')?.textContent).toContain('当天小结');
        expect(container.querySelector('[data-record-id="r-old"]')?.getAttribute('aria-pressed')).toBe('false');
        await act(async () => finish({ questionText: '迟到的题目' }));
        expect(container.querySelector('aside')?.textContent).not.toContain('迟到的题目');
        expect(mocks.get.mock.calls.filter(call => String(call[0]).startsWith('/api/practice/history?'))).toHaveLength(1);
    });
    it('直达地址恢复日期、记录与筛选；手机在底部面板展示', async () => {
        mocks.wide = false; mocks.search = `date=${yesterday}&record=r-old&subjectId=math&result=wrong`;
        await render();
        expect(mocks.get).toHaveBeenCalledWith(`/api/practice/history?days=7&date=${yesterday}&subjectId=math&result=wrong`);
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain('我当时写的');
        expect(container.querySelector('aside')).toBeNull();
        const close = document.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!;
        await click(close);
        expect(new URLSearchParams(mocks.search).get('record')).toBeNull();
        expect(new URLSearchParams(mocks.search).get('subjectId')).toBe('math');
        expect(new URLSearchParams(mocks.search).get('result')).toBe('wrong');
        expect(container.querySelector(`[data-day="${yesterday}"]`)?.getAttribute('aria-pressed')).toBe('true');
    });
    it('选天独立加载，更新地址时清除所选记录', async () => {
        await render();
        const date = container.querySelector<HTMLButtonElement>(`[data-day="${today}"]`)!;
        await click(date);
        expect(mocks.replace).toHaveBeenLastCalledWith(`/history?date=${today}`, { scroll: false });
        expect(mocks.get).toHaveBeenCalledWith(`/api/practice/history?days=7&date=${today}`);
        expect(container.textContent).toContain('这天没有做题');
    });
    it('空账户与筛选为空文案区分，均保留去今天入口', async () => {
        mocks.get.mockImplementation(async (url: string) => url === '/api/notebooks' ? [] : { days: [], hasMore: false, nextBefore: null });
        await render();
        expect(container.textContent).toContain('还没有做题记录');
        expect(container.querySelector('a[href="/"]')?.textContent).toBe('去今天看看');
        mocks.search = 'result=wrong';
        await render();
        expect(container.textContent).toContain('没有符合筛选的做题记录');
        expect(container.textContent).not.toContain('还没有做题记录');
    });
    it('切换筛选后全部为空时保留筛选空态和去今天入口', async () => {
        const get = mocks.get.getMockImplementation()!;
        mocks.get.mockImplementation((url: string) => url.startsWith('/api/practice/history?') && url.includes('result=wrong')
            ? Promise.resolve({ days: [], hasMore: false, nextBefore: null }) : get(url));
        await render();
        await click(container.querySelector<HTMLButtonElement>('[role="switch"]')!);
        expect(container.textContent).toContain('没有符合筛选的做题记录');
        expect(container.querySelector('a[href="/"]')?.textContent).toBe('去今天看看');
        expect(container.querySelector('[data-history-date]')).toBeNull();
    });
});
