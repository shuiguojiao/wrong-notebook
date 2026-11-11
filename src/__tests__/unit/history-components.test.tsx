import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryCalendar } from '@/components/history/history-calendar';
import { HistoryDayList } from '@/components/history/history-day-list';
import { HistoryDaySummary, HistoryDetail } from '@/components/history/history-detail';
import { LanguageProvider, loadEnTranslations } from '@/contexts/LanguageContext';
import { TimeZoneProvider } from '@/contexts/TimeZoneContext';
import { groupHistorySources, historyDayState, historyHref, historyWeekStart, shiftHistoryDate, validHistoryDate } from '@/lib/practice-history-view';
import type { PracticeHistoryDay, PracticeHistoryListRecord, PracticeRecordDetail } from '@/types/api';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get } }));
vi.mock('@/lib/frontend-logger', () => ({ frontendLogger: { error: vi.fn() } }));
let root: Root;
let container: HTMLDivElement;
const record: PracticeHistoryListRecord = { id: 'r1', source: 'review', result: 'wrong', createdAt: '2026-11-10T11:42:00Z', durationSec: 80, confidence: 'unsure', subjectName: '数学', preview: '计算 $x^2$', hasAnswerImage: true, hasAnswerText: true, errorItemId: 'q1', exam: null };
const detail: PracticeRecordDetail = { ...record, source: 'practice', questionText: '类似题 $x^2$', figureSvg: null, originalImageUrl: null, hasFigure: false, figureScale: 100, figureAlign: 'center', answerText: '参考答案', analysis: '解析', userAnswer: '我写的答案', answerImageUrl: 'data:image/png;base64,AA==', recognizedAnswer: '转写', gradeReason: '需要补充步骤', notes: null };
const makeDay = (records = [record]): PracticeHistoryDay => ({ date: '2026-11-10', summary: { total: 1, correct: 0, wrong: 1, notAttempted: 0, reviewDurationSec: 80 }, records });
async function render(children: ReactNode) { await act(async () => root.render(<LanguageProvider><TimeZoneProvider initialTimeZone="Asia/Shanghai">{children}</TimeZoneProvider></LanguageProvider>)); }
function button(label: string) { return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!; }
beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.setItem('app-language', 'zh');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('周条与日历', () => {
    it('周一开始、跨年与闰日运算，校验日期与未来边界', () => {
        expect(historyWeekStart('2026-11-15')).toBe('2026-11-09');
        expect(historyWeekStart('2027-01-01')).toBe('2026-12-28');
        expect(shiftHistoryDate('2024-03-01', -1)).toBe('2024-02-29');
        expect(validHistoryDate('2026-02-30', '2026-11-10')).toBeUndefined();
        expect(validHistoryDate('2026-11-11', '2026-11-10')).toBeUndefined();
        expect(historyHref('2026-11-10', 'id & 1')).toBe('/history?date=2026-11-10&record=id+%26+1');
        expect([historyDayState(0, 0), historyDayState(2, 1), historyDayState(2, 2)]).toEqual(['empty', 'answered', 'perfect']);
    });
    it('三种形状、完整无障碍名称、今天标记和不能翻未来周', async () => {
        mocks.get.mockResolvedValue({ days: [
            { date: '2026-11-09', total: 0, correct: 0 }, { date: '2026-11-10', total: 14, correct: 11 }, { date: '2026-11-11', total: 2, correct: 2 },
        ] });
        const select = vi.fn();
        await render(<HistoryCalendar today="2026-11-11" selected="2026-11-10" subjectId="" onSelect={select} />);
        expect(container.querySelectorAll('button[data-day]')).toHaveLength(7);
        for (const [date, state] of [['09', 'empty'], ['10', 'answered'], ['11', 'perfect']]) expect(container.querySelector(`[data-day="2026-11-${date}"]`)?.getAttribute('data-day-state')).toBe(state);
        expect(button('下一周').disabled).toBe(true);
        const selected = container.querySelector<HTMLButtonElement>('[data-day="2026-11-10"]')!;
        expect(selected.getAttribute('aria-label')).toContain('做了 14 题 · 对 11');
        expect(selected.getAttribute('aria-pressed')).toBe('true');
        expect(container.textContent).toContain('今天');
        await act(async () => selected.click()); expect(select).toHaveBeenCalledWith('2026-11-10');
        await act(async () => button('上一周').click());
        expect(mocks.get).toHaveBeenLastCalledWith('/api/practice/history/calendar?from=2026-11-02&to=2026-11-08');
        expect(button('下一周').disabled).toBe(false);
        await act(async () => button('下一周').click());
        expect(mocks.get).toHaveBeenCalledTimes(2);
    });
    it('月历可看更早月份，当前月禁用向未来翻页', async () => {
        mocks.get.mockResolvedValue({ days: [] });
        await render(<HistoryCalendar today="2026-11-10" selected="2026-11-10" subjectId="" onSelect={vi.fn()} />);
        await act(async () => container.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click());
        expect(container.querySelectorAll('button[data-day]')).toHaveLength(30);
        expect(button('下个月').disabled).toBe(true);
        await act(async () => button('上个月').click());
        expect(mocks.get).toHaveBeenLastCalledWith('/api/practice/history/calendar?from=2026-10-01&to=2026-10-31');
        expect(container.querySelectorAll('button[data-day]')).toHaveLength(31);
    });
    it('回到今天仅在选了其他日期或浏览其他周时显示，并放在月份标题行', async () => {
        mocks.get.mockResolvedValue({ days: [] });
        const select = vi.fn();
        const calendar = (selected: string) => <HistoryCalendar today="2026-11-10" selected={selected} subjectId="" onSelect={select} />;
        const back = () => [...container.querySelectorAll('button')].find(node => node.textContent === '回到今天');
        await render(calendar('2026-11-10'));
        expect(back()).toBeUndefined();
        await act(async () => button('上一周').click());
        expect(back()).toBeTruthy();
        expect(container.querySelector('button[aria-expanded]')?.parentElement?.contains(back()!)).toBe(true);
        await act(async () => back()!.click());
        expect(select).toHaveBeenLastCalledWith('2026-11-10');
        expect(back()).toBeUndefined();
        await render(calendar('2026-11-09'));
        expect(back()).toBeTruthy();
    });
});

describe('按来源回看', () => {
    it('试卷按 paperId 分组默认折叠，选中记录展开所在试卷', async () => {
        const paper = (id: string, paperId: string): PracticeHistoryListRecord => ({ ...record, id, source: 'exam', exam: { paperId, title: '周末小测', order: 1 } });
        const day = makeDay([paper('e1', 'p1'), { ...record, id: 'm1', source: 'manual' }, record, paper('e2', 'p2'), { ...record, id: 'p1', source: 'practice' }]);
        expect(groupHistorySources(day.records).map(([key]) => key)).toEqual(['review', 'practice', 'exam:p1', 'exam:p2', 'manual']);
        await render(<HistoryDayList day={day} selectedRecord="" onSelect={vi.fn()} />);
        expect(container.querySelectorAll('details')).toHaveLength(2);
        expect(container.querySelector('details[open]')).toBeNull();
        expect(container.querySelector('a[href="/exams/p1"]')?.textContent).toBe('打开试卷');
        expect(container.querySelector('.katex')).toBeTruthy();
        const preview = container.querySelector('.katex')!.closest('div')!;
        expect(preview.className).toContain('relative');
        expect(preview.className).toContain('overflow-hidden');
        expect(preview.className).toContain('max-h-6');
        // 省略号只截文字，KaTeX 上标会残留在行尾，预览不能用 truncate
        expect(preview.className).not.toContain('truncate');
        expect(preview.className).toContain('whitespace-nowrap');
        expect(container.querySelector('time')?.textContent).toBe('19:42');
        await act(async () => { container.querySelector('details')!.open = true; });
        expect(container.querySelector('details')!.open).toBe(true);
        await render(<HistoryDayList day={day} selectedRecord="e2" onSelect={vi.fn()} />);
        expect(container.querySelectorAll('details')[1].open).toBe(true);
    });
    it('复用差一点印章、灰色没做，重复作答不合并，小结只使用复习用时', async () => {
        await render(<HistoryDayList day={makeDay([record, { ...record, id: 'r2', result: 'not_attempted', source: 'exam' }])} selectedRecord="" onSelect={vi.fn()} />);
        expect(container.querySelectorAll('button[data-record-id]')).toHaveLength(2);
        expect(container.querySelector('[data-stamp="almost"]')?.getAttribute('aria-label')).toBe('差一点');
        expect(container.textContent).toContain('没做');
        expect(container.textContent).toContain('复习用时 2 分钟');
        await render(<HistoryDaySummary day={makeDay()} />);
        expect(container.textContent).toContain('数学 · 做了 1 题 · 对 0 · 差一点 1');
    });
    it('详情显示快照与当时作答，参考答案与 AI 转写默认折叠，无原题时不显示入口', async () => {
        mocks.get.mockResolvedValue(detail);
        await render(<HistoryDetail id="r1" />);
        expect(container.textContent).toContain('再来一道类似的');
        expect(container.textContent).toContain('我当时写的');
        expect(container.textContent).toContain('我写的答案');
        expect(container.textContent).toContain('为什么这样判');
        expect(container.textContent).toContain('还不太熟');
        expect(container.querySelector('.katex')).toBeTruthy();
        expect(container.querySelectorAll('details[open]')).toHaveLength(0);
        expect(container.querySelector('a[href="/error-items/q1"]')?.textContent).toBe('打开原题');
        expect(container.querySelector('button[aria-label*="放大查看"]')).toBeTruthy();
        await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label*="放大查看"]')!.click());
        expect(document.querySelector('[role="dialog"] img')).toBeTruthy();
        const zoomIn = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(value => value.textContent === '放大')!;
        await act(async () => zoomIn.click());
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain('125%');
        await act(async () => document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="关闭"]')!.click());
        expect(container.querySelector('button[aria-label*="删除"]')).toBeNull();
        mocks.get.mockResolvedValue({ ...detail, errorItemId: null });
        await render(<HistoryDetail key="r2" id="r2" />);
        expect(container.querySelector('a[href*="/error-items/"]')).toBeNull();
    });
    it.each(['zh', 'en'])('小结与列表使用相同的本地化日期（%s）', async language => {
        await loadEnTranslations();
        localStorage.setItem('app-language', language);
        await render(<><HistoryDayList day={makeDay()} selectedRecord="" onSelect={vi.fn()} /><HistoryDaySummary day={makeDay()} /></>);
        const date = container.querySelector('h2')!.textContent!;
        expect(container.lastElementChild?.textContent).toContain(date);
        expect(container.lastElementChild?.textContent).not.toContain('2026-11-10');
        if (language === 'zh') expect(date).toBe('11月10日星期二');
    });
    it.each([
        ['zh', 0, '0 秒'], ['zh', 7, '7 秒'], ['zh', 60, '1 分 0 秒'], ['zh', 80, '1 分 20 秒'],
        ['en', 7, '7 sec'], ['en', 60, '1 min 0 sec'], ['en', 80, '1 min 20 sec'], ['en', null, ''],
    ] as const)('详情短日期与用时本地化（%s，%s 秒）', async (language, durationSec, duration) => {
        await loadEnTranslations();
        localStorage.setItem('app-language', language);
        mocks.get.mockResolvedValue({ ...detail, durationSec });
        await render(<HistoryDetail id="duration" />);
        const header = container.querySelector('article > p')!.textContent!;
        const timestamp = container.querySelector('time')!.textContent!;
        expect(timestamp).toContain('19:42');
        expect(timestamp).not.toContain('2026');
        expect(timestamp).toContain(language === 'zh' ? '11月10日' : 'Nov 10');
        if (duration) expect(header.endsWith(` · ${duration}`)).toBe(true);
        else expect(header.endsWith(timestamp)).toBe(true);
        expect(header).not.toContain(language === 'zh' ? '0 分' : '0 min');
    });
    it('二次摘要保留边界前的完整公式，回退后的省略号不会产生残缺公式', async () => {
        await render(<HistoryDayList day={makeDay([{ ...record, preview: '题'.repeat(117) + '$x$…' }])} selectedRecord="" onSelect={vi.fn()} />);
        expect(container.querySelectorAll('.katex')).toHaveLength(1);
        expect(container.querySelector('.katex-error')).toBeNull();
        expect(container.textContent).toContain('…');
    });
});
