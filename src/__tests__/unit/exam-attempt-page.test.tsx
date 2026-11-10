import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExamAttemptPage from '@/app/exams/[id]/attempts/[aid]/page';
import { AttemptHistory } from '@/components/exam-attempt/attempt-history';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { TimeZoneProvider } from '@/contexts/TimeZoneContext';
import { apiClient } from '@/lib/api-client';
import { confirmDialog } from '@/lib/feedback';
import { translations } from '@/lib/translations';
import { attemptAnswer, examAttempt } from '../fixtures/exam-attempt';
import type { ExamAttemptDetail } from '@/types/api';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'paper-1', aid: 'attempt' }), useRouter: () => navigation }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/components/markdown-renderer', () => ({ MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div> }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/lib/exam/exam-answering-draft', async original => ({ ...(await original<typeof import('@/lib/exam/exam-answering-draft')>()), examDraftStorage: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/feedback', () => ({ confirmDialog: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
let server: ExamAttemptDetail;
const t = translations.zh;
const base = '/api/exams/paper-1/attempts/attempt';

beforeEach(() => {
    localStorage.removeItem('app-language');
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T03:27:00Z'));
    server = examAttempt();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(apiClient.get).mockImplementation(async () => structuredClone(server));
    vi.mocked(apiClient.patch).mockImplementation(async (url, body) => {
        const questionId = url.split('/').pop()!;
        const answer = { ...attemptAnswer(questionId), ...server.answers.find(item => item.examQuestionId === questionId), ...body as object };
        server.answers = [...server.answers.filter(item => item.examQuestionId !== questionId), answer];
        return answer;
    });
    vi.mocked(apiClient.post).mockImplementation(async (_url, body) => {
        server.status = 'done';
        server.submittedAt = (body as { takenAt?: string }).takenAt ?? '2026-10-19T03:27:00Z';
        return {};
    });
    vi.mocked(apiClient.delete).mockResolvedValue({});
    vi.mocked(confirmDialog).mockResolvedValue(true);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    localStorage.removeItem('app-language');
    vi.unstubAllGlobals();
    vi.useRealTimers();
});
async function render(zone = 'Asia/Shanghai') {
    await act(async () => root.render(<LanguageProvider><TimeZoneProvider initialTimeZone={zone}><ExamAttemptPage /></TimeZoneProvider></LanguageProvider>));
}
function button(text: string) {
    const found = Array.from(container.querySelectorAll('button')).find(item => item.textContent === text);
    if (!found) throw new Error(`未找到按钮：${text}`);
    return found;
}
async function choose(id: string, result: string) {
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>(`[data-question-id="${id}"] button[aria-pressed]`)).find(item => item.textContent === result)!;
    await act(async () => option.click());
}
async function setDate(value: string) {
    const input = container.querySelector<HTMLInputElement>('#exam-taken-at')!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('试卷批改结果页', () => {
    it('手动录入重新打开部分结果仍平铺，点选保持卡片节点与顺序并更新选中态', async () => {
        server.answers = [attemptAnswer('q1', 'wrong')];
        await render();
        const cards = Array.from(container.querySelectorAll('[data-question-id]'));
        expect(container.textContent).not.toContain(t.examAttempt.attention);
        for (const [label, color] of [['对', 'bg-emerald-700'], ['差一点', 'bg-orange-700'], ['没做', 'bg-slate-600']]) {
            await choose('q1', label);
            expect(Array.from(container.querySelectorAll('[data-question-id]'))).toEqual(cards);
            const selected = cards[0].querySelector('button[aria-pressed="true"]');
            expect(selected?.textContent).toBe(label);
            expect(selected?.className).toContain(color);
            expect(selected?.querySelector('svg')?.classList.contains('invisible')).toBe(false);
            expect(cards[0].querySelectorAll('button[aria-pressed="false"]')).toHaveLength(2);
        }
    });

    it('已分组作答编辑时不换组，重新载入才按新结果分组', async () => {
        server.kind = 'photo';
        server.answers = [attemptAnswer('q2', 'wrong')];
        await render();
        const card = container.querySelector('[data-question-id="q1"]')!;
        const section = card.closest('section');
        await choose('q1', '对');
        await choose('q2', '对');
        expect(container.querySelector('[data-question-id="q1"]')).toBe(card);
        expect(card.closest('section')).toBe(section);
        expect(section?.querySelector('h2')?.textContent).toBe('要看一眼（2）');
        expect(container.textContent).toContain('对 2 题 / 共 3 题');
        expect(container.textContent).not.toContain('做对的（2）');
        // 请求失败后重试会重新载入，允许此时按服务器最新结果重建分组。
        vi.mocked(apiClient.patch).mockRejectedValueOnce(new Error('离线'));
        await choose('q1', '差一点');
        expect(card.closest('section')).toBe(section);
        await act(async () => button(t.review.retry).click());
        expect(container.textContent).toContain('做对的（2）');
    });

    it('题干按实际溢出显示展开，尺寸变化后复测，展开后可收起', async () => {
        let height = 40;
        let resize = () => {};
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40);
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: () => void) { resize = callback; }
            observe() {}
            disconnect() {}
        });
        await render();
        expect(container.textContent).not.toContain(t.common.expand);
        height = 100;
        await act(async () => window.dispatchEvent(new Event('resize')));
        const expand = button(t.common.expand);
        expect(expand.getAttribute('aria-expanded')).toBe('false');
        await act(async () => expand.click());
        expect(button(t.common.collapse).getAttribute('aria-expanded')).toBe('true');
        await act(async () => button(t.common.collapse).click());
        height = 40;
        await act(async () => { resize(); window.dispatchEvent(new Event('resize')); });
        expect(container.textContent).not.toContain(t.common.expand);
    });

    it.each([
        ['zh', 34, '用时 34 秒'], ['zh', 80, '用时 1 分 20 秒'],
        ['en', 34, 'Time 34s'], ['en', 80, 'Time 1m 20s'],
        ['zh', 0, '用时 0 秒'], ['en', 60, 'Time 1m 0s'],
    ])('用时按语言和整分钟格式显示 %s %i', async (language, duration, expected) => {
        localStorage.setItem('app-language', language);
        server.durationSec = Number(duration);
        await render();
        expect(container.querySelector('header')?.textContent).toContain(expected);
    });

    it.each([
        ['EXAM_GRADE_FAILED', '没判出来，请自己选'],
        ['AI_DAILY_LIMIT_EXCEEDED', '今天的 AI 次数用完了，请自己对答案'],
        ['AI_CONSENT_REQUIRED', '还没同意 AI 数据处理，请自己对答案'],
        [null, '没判出来，请自己选'],
    ])('没有 AI 结论时只显示原因并紧邻重判按钮 %s', async (aiReason, expected) => {
        server.answers = [{ ...attemptAnswer('q1'), aiResult: 'unknown', aiReason, canRetry: true }];
        await render();
        const card = container.querySelector('[data-question-id="q1"]')!;
        expect(card.textContent).not.toContain('AI 判断');
        expect(card.textContent).not.toContain('判题依据');
        const reason = [...card.querySelectorAll('p')].find(node => node.textContent === expected)!;
        expect(reason).toBeDefined();
        expect(reason.parentElement?.querySelector('button')?.textContent).toBe(t.examAnswering.regrade);
        await act(async () => reason.parentElement?.querySelector('button')?.click());
        expect(apiClient.post).toHaveBeenCalledWith(`${base}/answers/q1/regrade`, {});
    });

    it('头部与完成章用应用时区的短日期', async () => {
        server.status = 'done';
        server.submittedAt = '2026-11-10T03:27:00Z';
        await render('America/New_York');
        expect(container.querySelector('header')?.textContent).toContain('第 2 次 · 11月9日');
        expect(container.querySelector('[data-stamp="done"]')?.getAttribute('aria-label')).toContain('11月9日');
        expect(container.querySelector('header')?.textContent).not.toContain('2026-11-10');
    });

    it('英文头部与完成章使用英文短日期', async () => {
        localStorage.setItem('app-language', 'en');
        server.status = 'done';
        server.submittedAt = '2026-11-10T03:27:00Z';
        await render();
        expect(container.querySelector('header')?.textContent).toContain('Nov 10');
        expect(container.querySelector('[data-stamp="done"]')?.getAttribute('aria-label')).toContain('Nov 10');
    });

    it('作答记录空态保留说明，标题与说明在同一个紧凑行', async () => {
        await act(async () => root.render(<LanguageProvider><TimeZoneProvider initialTimeZone="Asia/Shanghai"><AttemptHistory paperId="paper-1" attempts={[]} /></TimeZoneProvider></LanguageProvider>));
        const heading = container.querySelector('h2')!;
        expect(heading.textContent).toBe(t.examAttempt.history);
        expect(heading.parentElement?.querySelector('p')?.textContent).toBe(t.examAttempt.noHistory);
        expect(heading.parentElement?.classList.contains('flex')).toBe(true);
    });

    it('手动空白列表、未判数量与定位、得分随选择更新，删除题不阻止确认', async () => {
        await render();
        expect(container.textContent).not.toContain(t.examAttempt.attention);
        expect(container.textContent).toContain('还有 2 题没判');
        expect(button(t.examAttempt.confirm).disabled).toBe(true);
        await act(async () => button('还有 2 题没判').click());
        expect(document.activeElement?.id).toBe('question-q1');
        expect(container.textContent).toContain(t.examAttempt.deleted);
        expect(container.querySelector('[data-question-id="q3"] button[aria-pressed]')).toBeNull();
        await choose('q1', '对');
        expect(container.textContent).toContain('得分 2.5 / 7.5');
        expect(container.textContent).toContain('对 1 题 / 共 3 题');
        expect(container.textContent).not.toContain('做对的（1）');
        expect(container.textContent).not.toContain(t.examAttempt.attention);
        expect(Array.from(container.querySelectorAll('[data-question-id]')).map(card => card.getAttribute('data-question-id'))).toEqual(['q1', 'q2', 'q3']);
        await choose('q2', '差一点');
        expect(button(t.examAttempt.confirm).disabled).toBe(false);
        await act(async () => button(t.examAttempt.confirm).click());
        expect(apiClient.post).toHaveBeenCalledWith(`${base}/confirm`, { takenAt: '2026-10-19T03:27:00.000Z' });
        expect(container.querySelector('[data-stamp="done"]')).not.toBeNull();
        const correctGroup = Array.from(container.querySelectorAll('details')).find(details => details.querySelector('summary')?.textContent === '做对的（1）');
        expect(correctGroup).toBeDefined();
        expect(correctGroup?.open).toBe(false);
        expect(container.querySelector('button[aria-pressed]')).toBeNull();
        expect(container.querySelector('a[href="/error-items/e2"]')?.textContent).toBe(t.examAttempt.fix);
        expect(container.textContent).not.toContain(t.examAttempt.discard);
        await act(async () => button(t.examAttempt.edit).click());
        expect(container.querySelector('button[aria-pressed]')).not.toBeNull();
        expect(container.textContent).not.toContain(t.examAttempt.discard);
        await choose('q2', '对');
        await act(async () => button(t.examAttempt.confirm).click());
        expect(apiClient.post).toHaveBeenCalledTimes(2);
    });

    it.each(['Asia/Shanghai', 'America/New_York'])('手动日期使用应用时区 %s，补录历史日期且不能选未来', async zone => {
        await render(zone);
        const expectedToday = zone === 'Asia/Shanghai' ? '2026-10-19' : '2026-10-18';
        const input = container.querySelector<HTMLInputElement>('#exam-taken-at')!;
        expect(input.value).toBe(expectedToday);
        expect(input.max).toBe(expectedToday);
        await choose('q1', '对');
        await choose('q2', '没做');
        await setDate('2026-10-20');
        expect(button(t.examAttempt.confirm).disabled).toBe(true);
        expect(container.textContent).toContain(t.examAttempt.dateHint);
        await setDate('2026-10-17');
        await act(async () => button(t.examAttempt.confirm).click());
        expect(apiClient.post).toHaveBeenCalledWith(`${base}/confirm`, { takenAt: zone === 'Asia/Shanghai' ? '2026-10-17T04:00:00.000Z' : '2026-10-17T16:00:00.000Z' });
    });

    it('先乐观更新，保存中禁止确认；失败回滚并提示，可重试', async () => {
        let reject: (error: Error) => void = () => {};
        vi.mocked(apiClient.patch).mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
        await render();
        await choose('q1', '对');
        expect(container.textContent).toContain('得分 2.5 / 7.5');
        expect(button(t.examAttempt.confirm).disabled).toBe(true);
        await act(async () => reject(new Error('离线')));
        expect(container.textContent).toContain('得分 0 / 7.5');
        expect(container.textContent).toContain('还有 2 题没判');
        expect(container.querySelector('[role="alert"]')?.textContent).toContain(t.examAttempt.networkError);
        await choose('q1', '对');
        expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it('done 只读、参考答案折叠、有图文和 AI 数据才显示，并标记已改', async () => {
        server.status = 'done';
        server.kind = 'photo';
        server.durationSec = 62;
        server.answers = [{ ...attemptAnswer('q1', 'wrong'), aiResult: 'correct', aiReason: '依据内容', answerText: '手写答案', recognizedAnswer: '转写内容', answerImageUrl: 'local-image:opaque' }, attemptAnswer('q2', 'correct')];
        await render();
        expect(container.querySelector('button[aria-pressed]')).toBeNull();
        expect(container.querySelector('#exam-taken-at')).toBeNull();
        expect(container.textContent).toContain('用时 1 分 2 秒');
        expect(container.textContent).toContain(t.examAttempt.changed);
        expect(container.querySelector('img')?.getAttribute('src')).toBe(`${base}/answers/q1/image`);
        const reference = Array.from(container.querySelectorAll('details')).find(details => details.querySelector('summary')?.textContent === t.examAttempt.reference);
        expect(reference?.open).toBe(false);
        expect(container.querySelector('[data-question-id="q2"]')?.textContent).not.toContain(t.examAttempt.mine);
        await act(async () => button(t.examAttempt.edit).click());
        expect(container.querySelector('button[aria-pressed]')).not.toBeNull();
    });

    it('批改中每两秒轮询，隐藏时暂停，完成后自动进入结果页', async () => {
        vi.useFakeTimers();
        let hidden = false;
        vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
        server.status = 'grading';
        await render();
        const before = vi.mocked(apiClient.get).mock.calls.length;
        await act(async () => vi.advanceTimersByTimeAsync(2000));
        expect(vi.mocked(apiClient.get).mock.calls.length).toBe(before + 1);
        hidden = true; document.dispatchEvent(new Event('visibilitychange'));
        await act(async () => vi.advanceTimersByTimeAsync(6000));
        expect(vi.mocked(apiClient.get).mock.calls.length).toBe(before + 1);
        server.status = 'reviewing';
        hidden = false; document.dispatchEvent(new Event('visibilitychange'));
        await act(async () => vi.advanceTimersByTimeAsync(2000));
        expect(container.textContent).toContain('确认并保存');
        const done = vi.mocked(apiClient.get).mock.calls.length;
        await act(async () => vi.advanceTimersByTimeAsync(4000));
        expect(vi.mocked(apiClient.get).mock.calls.length).toBe(done);
    });

    it.each(['answering', 'grading'] as const)('%s 状态展示专注作答或进度，不展示答案与确认按钮', async status => {
        server.status = status;
        await render();
        expect(container.textContent).toContain(status === 'answering' ? t.examAnswering.submit : '正在批改');
        expect(container.querySelector('[data-question-id]')).toBeNull();
        expect(container.textContent).not.toContain(t.examAttempt.confirm);
        if (status === 'grading') expect(container.querySelector('a[href="/exams/paper-1"]')).not.toBeNull();
    });

    it('放弃需确认，取消时不删除，确认后返回试卷', async () => {
        await render();
        vi.mocked(confirmDialog).mockResolvedValueOnce(false);
        await act(async () => button(t.examAttempt.discard).click());
        expect(apiClient.delete).not.toHaveBeenCalled();
        await act(async () => button(t.examAttempt.discard).click());
        expect(confirmDialog).toHaveBeenCalledWith(t.examAttempt.discardConfirm, { destructive: true });
        expect(apiClient.delete).toHaveBeenCalledWith(base);
        expect(navigation.push).toHaveBeenCalledWith('/exams/paper-1');
    });
});
