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
});
