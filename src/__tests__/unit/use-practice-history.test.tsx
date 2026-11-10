import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { historyQuery, usePracticeCalendar, usePracticeHistory } from '@/lib/hooks/use-practice-history';
import type { PracticeHistoryDay, PracticeHistoryPage } from '@/types/api';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get } }));
let root: Root;
let container: HTMLDivElement;
let history: ReturnType<typeof usePracticeHistory>;
let calendar: ReturnType<typeof usePracticeCalendar>;
type Options = Parameters<typeof usePracticeHistory>[0];
function Probe({ options }: { options: Options }) {
    const value = usePracticeHistory(options);
    useEffect(() => { history = value; });
    return null;
}
function CalendarProbe({ from, subjectId = '' }: { from: string; subjectId?: string }) {
    const value = usePracticeCalendar(from, from, subjectId);
    useEffect(() => { calendar = value; });
    return null;
}
const day = (date: string): PracticeHistoryDay => ({ date, summary: { total: 1, correct: 1, wrong: 0, notAttempted: 0, reviewDurationSec: 10 }, records: [] });
const page = (date: string, nextBefore: string | null = null): PracticeHistoryPage => ({ days: [day(date)], nextBefore, hasMore: nextBefore !== null });
async function render(options: Options = { subjectId: '', wrongOnly: false }) {
    await act(async () => root.render(<Probe options={options} />));
}
beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div'); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

describe('做题记录分页与筛选', () => {
    it('首次七天，分页去重并沿用游标，末页停止', async () => {
        mocks.get.mockResolvedValueOnce(page('2026-11-10', '2026-11-04'))
            .mockResolvedValueOnce({ ...page('2026-11-03'), days: [day('2026-11-10'), day('2026-11-03')] });
        await render();
        expect(mocks.get).toHaveBeenNthCalledWith(1, '/api/practice/history?days=7');
        await act(async () => { await Promise.all([history.loadMore(), history.loadMore()]); });
        expect(mocks.get).toHaveBeenCalledTimes(2);
        expect(mocks.get).toHaveBeenLastCalledWith('/api/practice/history?days=7&before=2026-11-04');
        expect(history.days.map(value => value.date)).toEqual(['2026-11-10', '2026-11-03']);
        expect(history.hasMore).toBe(false);
        await act(async () => history.loadMore());
        expect(mocks.get).toHaveBeenCalledTimes(2);
    });
    it('指定日单独取数，空日仍接上更早的七天窗口', async () => {
        mocks.get.mockResolvedValueOnce({ days: [], hasMore: true, nextBefore: '2026-11-10' }).mockResolvedValueOnce(page('2026-11-08'));
        await render({ date: '2026-11-10', subjectId: 'math', wrongOnly: true });
        expect(mocks.get.mock.calls.map(call => call[0])).toEqual([
            '/api/practice/history?days=7&date=2026-11-10&subjectId=math&result=wrong',
            '/api/practice/history?days=7&before=2026-11-10&subjectId=math&result=wrong',
        ]);
        expect(history.days.map(value => value.date)).toEqual(['2026-11-08']);
    });
    it('切换筛选隔离旧请求，刷新后保持筛选条件', async () => {
        let resolveOld!: (value: PracticeHistoryPage) => void;
        mocks.get.mockReturnValueOnce(new Promise<PracticeHistoryPage>(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(page('2026-11-09'));
        await render();
        await render({ subjectId: 'english', wrongOnly: true });
        await act(async () => resolveOld(page('2026-11-10')));
        expect(history.days[0].date).toBe('2026-11-09');
        expect(mocks.get).toHaveBeenLastCalledWith('/api/practice/history?days=7&subjectId=english&result=wrong');
        expect(historyQuery({ date: '2026-11-10', subjectId: 'english', wrongOnly: true })).toContain('date=2026-11-10');
    });
    it('分页失败保留已加载记录，重试相同游标', async () => {
        mocks.get.mockResolvedValueOnce(page('2026-11-10', '2026-11-04')).mockRejectedValueOnce(new Error('离线')).mockResolvedValueOnce(page('2026-11-02'));
        await render();
        await act(async () => history.loadMore());
        expect(history.error).toBe(true); expect(history.days).toHaveLength(1);
        await act(async () => history.retry());
        expect(history.error).toBe(false); expect(history.days).toHaveLength(2);
        expect(mocks.get.mock.calls[1][0]).toBe(mocks.get.mock.calls[2][0]);
    });
    it('首次失败可重试，不把失败当作空记录', async () => {
        mocks.get.mockRejectedValueOnce(new Error('离线')).mockResolvedValueOnce(page('2026-11-10'));
        await render(); expect(history.error).toBe(true);
        await act(async () => history.retry());
        expect(history.days).toHaveLength(1); expect(history.error).toBe(false);
    });
});

describe('做题日历缓存', () => {
    it('相同区间返回缓存，按学科隔离，不带错答参数', async () => {
        mocks.get.mockImplementation(async () => ({ days: [{ date: '2026-11-10', total: 2, correct: 1 }] }));
        const renderCalendar = (from: string, subjectId = '') => act(async () => root.render(<CalendarProbe from={from} subjectId={subjectId} />));
        await renderCalendar('2026-11-10');
        await renderCalendar('2026-11-09');
        await renderCalendar('2026-11-10');
        expect(mocks.get).toHaveBeenCalledTimes(2);
        expect(calendar.data?.days[0].total).toBe(2);
        await renderCalendar('2026-11-10', 'math');
        expect(mocks.get).toHaveBeenCalledTimes(3);
        expect(mocks.get).toHaveBeenLastCalledWith('/api/practice/history/calendar?from=2026-11-10&to=2026-11-10&subjectId=math');
    });
});
