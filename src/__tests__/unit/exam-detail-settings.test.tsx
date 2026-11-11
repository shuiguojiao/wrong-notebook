import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExamDetailPage from '@/app/exams/[id]/page';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { TimeZoneProvider } from '@/contexts/TimeZoneContext';
import { apiClient } from '@/lib/api-client';
import { confirmDialog } from '@/lib/feedback';
import { translations } from '@/lib/translations';
import type { ExamPaperDetail } from '@/types/api';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'paper-1' }), useRouter: () => navigation }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a> }));
vi.mock('@/components/ui/back-button', () => ({ BackButton: () => null }));
vi.mock('@/components/markdown-renderer', () => ({ MarkdownRenderer: ({ content }: { content: string }) => <p>{content}</p> }));
vi.mock('@/components/exam/exam-question-regenerate', () => ({ ExamQuestionRegenerate: () => null }));
vi.mock('@/lib/hooks/use-running-task', () => ({ useRunningTask: () => ({ running: null, refresh: vi.fn() }) }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/lib/feedback', () => ({ confirmDialog: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));

const t = translations.zh;
let container: HTMLDivElement;
let root: Root;
let paper: ExamPaperDetail;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    paper = {
        id: 'paper-1', title: '数学试卷', mode: 'original', status: 'ready', scope: 'all', difficulty: 'same',
        requestedCount: 4, groupByType: false, resultsRecordedAt: null, createdAt: '2026-11-11T01:00:00Z', attempts: [],
        questions: [2.5, 0, null, undefined].map((score, index) => ({
            id: `q${index}`, order: index + 1, errorItemId: `e${index}`, sourceShortId: `A${index}`, status: 'ready',
            questionText: `题目 ${index + 1}`, answerText: '答案', analysis: null, error: null, notebookName: '数学',
            score, questionType: 'fill_blank', figureSvg: index === 0 ? '<svg xmlns="http://www.w3.org/2000/svg" />' : null,
            figureScale: 100, figureAlign: 'center', attempts: [],
        })),
    };
    vi.mocked(apiClient.get).mockImplementation(async () => paper);
    vi.mocked(apiClient.patch).mockResolvedValue({});
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'attempt-1', kind: 'online', status: 'answering' });
    vi.mocked(apiClient.delete).mockResolvedValue({});
    vi.mocked(confirmDialog).mockResolvedValue(false);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function renderPage() {
    await act(async () => root.render(<LanguageProvider><TimeZoneProvider initialTimeZone="Asia/Shanghai"><ExamDetailPage /></TimeZoneProvider></LanguageProvider>));
}
function button(text: string) {
    const found = Array.from(container.querySelectorAll('button')).find(element => element.textContent === text);
    expect(found).toBeDefined();
    return found!;
}
const click = (element: HTMLElement) => act(async () => element.click());
const scores = () => container.querySelectorAll<HTMLInputElement>('input[id^="exam-score-"]');

function setInput(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('试卷详情页排版与分值设置', () => {
    it.each([false, true])('默认收起，分组为 %s 时单题只读；展开再收起切换全部分值输入', async groupByType => {
        paper.groupByType = groupByType;
        await renderPage();
        const trigger = button(t.exam.layoutSettings);
        const panel = document.getElementById(trigger.getAttribute('aria-controls')!)!;
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(panel.hidden).toBe(true);
        expect(panel.getAttribute('aria-labelledby')).toBe(trigger.id);
        expect(panel.textContent).toContain(t.exam.uniformFigureScale);
        expect(panel.textContent).toContain(t.exam.uniformScore);
        expect(panel.textContent).toContain(t.exam.groupByType);
        expect(scores()).toHaveLength(0);
        expect(container.textContent).toContain('2.5 分');
        expect(container.textContent).toContain('0 分');
        const history = Array.from(container.querySelectorAll('h2')).find(element => element.textContent === t.examAttempt.history)!;
        expect(history.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        const question = Array.from(container.querySelectorAll('p')).find(element => element.textContent === '题目 1')!;
        expect(trigger.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        await click(trigger);
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(panel.hidden).toBe(false);
        expect(Array.from(scores(), input => input.value)).toEqual(['2.5', '0', '', '']);
        await click(trigger);
        expect(panel.hidden).toBe(true);
        expect(scores()).toHaveLength(0);
        expect(apiClient.patch).not.toHaveBeenCalled();
    });

    it('展开后保存批量分值、单题分值与分组，收起仍保留已保存的分值与分组', async () => {
        await renderPage();
        await click(button(t.exam.layoutSettings));
        const uniform = container.querySelector<HTMLInputElement>(`input[aria-label="${t.exam.uniformScore}"]`)!;
        await act(async () => setInput(uniform, '5'));
        await act(async () => uniform.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
        expect(apiClient.patch).toHaveBeenLastCalledWith('/api/exams/paper-1', { score: 5 });
        expect(Array.from(scores(), input => input.value)).toEqual(['5', '5', '5', '5']);
        await act(async () => setInput(scores()[0], '3.5'));
        await act(async () => scores()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
        expect(apiClient.patch).toHaveBeenLastCalledWith('/api/exams/paper-1', { questionId: 'q0', score: 3.5 });
        await click(container.querySelector<HTMLElement>('[role="checkbox"]')!);
        expect(apiClient.patch).toHaveBeenLastCalledWith('/api/exams/paper-1', { groupByType: true });
        await click(button(t.exam.layoutSettings));
        expect(container.textContent).toContain('3.5 分');
        expect(container.textContent).toContain('5 分');
        expect(Array.from(container.querySelectorAll('section h2')).filter(element => element.textContent?.includes('一、'))).toHaveLength(1);
    });

    it('重新进入不记忆展开状态，无配图时仅省略配图设置', async () => {
        paper.questions.forEach(question => { question.figureSvg = null; });
        await renderPage();
        await click(button(t.exam.layoutSettings));
        expect(container.textContent).not.toContain(t.exam.uniformFigureScale);
        await act(async () => root.render(null));
        await renderPage();
        expect(button(t.exam.layoutSettings).getAttribute('aria-expanded')).toBe('false');
        expect(scores()).toHaveLength(0);
    });

    it('头部操作顺序不变，手机更多菜单保留删除确认，取消不删除', async () => {
        await renderPage();
        const actions = button(t.examAnswering.start).parentElement!;
        expect(Array.from(actions.children).slice(0, 4).map(element => element.textContent)).toEqual([
            t.examAnswering.start, t.exam.print, t.examPhoto.title, t.examAttempt.manualEntry,
        ]);
        const more = button(t.exam.moreActions);
        expect(more.parentElement?.className).toContain('sm:hidden');
        expect(button(t.exam.delete).className).toContain('hidden');
        await act(async () => more.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
        const item = document.querySelector<HTMLElement>('[role="menuitem"]')!;
        expect(item.textContent).toBe(t.exam.delete);
        expect(apiClient.delete).not.toHaveBeenCalled();
        await click(item);
        expect(confirmDialog).toHaveBeenCalledWith(t.exam.deleteConfirm, { destructive: true });
        expect(apiClient.delete).not.toHaveBeenCalled();
        vi.mocked(confirmDialog).mockResolvedValue(true);
        await click(button(t.exam.delete));
        expect(apiClient.delete).toHaveBeenCalledWith('/api/exams/paper-1');
        expect(navigation.push).toHaveBeenCalledWith('/exams');
    });
});
