import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewPage from '@/app/review/page';
import { OriginalReview } from '@/components/review/original-review';
import { ReviewSession } from '@/components/review/review-session';
import { ReviewSummary } from '@/components/review/review-summary';
import { ReviewQuestion } from '@/components/review/review-question';
import { LanguageProvider } from '@/contexts/LanguageContext';
import type { ReviewOutcome } from '@/lib/review-session';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get, post: mocks.post }, ApiError: class extends Error {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: mocks.back, replace: mocks.replace }) }));
vi.mock('@/contexts/TimeZoneContext', () => ({ useTimeZone: () => ({ timeZone: 'Asia/Shanghai' }) }));
vi.mock('@/lib/hooks/use-running-task', () => ({ useRunningTask: () => ({ running: false, refresh: vi.fn() }) }));

let root: Root;
let container: HTMLDivElement;
const item = { id: 'a', questionText: '原题题干', answerText: '标准答案', analysis: '详细解析', wrongAnswerText: '过去的错答', originalImageUrl: '/test.png' };
const snapshot = [{ id: 'a', questionPreview: '原题摘要', nextReviewAt: '2026-11-07T16:00:00Z' }, { id: 'b', nextReviewAt: '2026-11-07T16:00:00Z' }];

async function render(node: ReactNode) {
    await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>));
}
function button(text: string) {
    const found = [...container.querySelectorAll('button')].find(element => element.textContent?.includes(text));
    expect(found, text).toBeTruthy();
    return found!;
}
async function answer(text: string) {
    const field = container.querySelector<HTMLTextAreaElement>('#review-answer')!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, text);
        field.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.setItem('language', 'zh');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.get.mockImplementation(async (url: string) => {
        if (url.startsWith('/api/review/due')) return { items: snapshot };
        if (url === '/api/notebooks') return [{ id: 'math', name: '数学' }];
        if (url.startsWith('/api/practice/generate')) return { practice: null };
        if (url === '/api/settings') return {};
        return item;
    });
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe('复习会话界面', () => {
    it('开始前可选 10/20/全部，默认 20 并保留科目参数；跳过后使用固定队列', async () => {
        await render(<ReviewSession initialSubjectId="math" initialLimit={null} />);
        expect([...container.querySelectorAll('select')].at(-1)?.value).toBe('20');
        expect(mocks.get.mock.calls.some(([url]) => url.startsWith('/api/review/due'))).toBe(false);
        await act(async () => button('开始复习').click());
        expect(mocks.get).toHaveBeenCalledWith('/api/review/due?format=ids&limit=20&subjectId=math');
        expect(container.textContent).toContain('第 1 / 2 题');
        await act(async () => button('跳过').click());
        expect(container.textContent).toContain('第 2 / 2 题');
        expect(mocks.get).toHaveBeenCalledWith('/api/error-items/b');
        expect(mocks.get.mock.calls.filter(([url]) => url.startsWith('/api/review/due'))).toHaveLength(1);
        expect(mocks.post).not.toHaveBeenCalled();
        await act(async () => button('跳过').click());
        expect(container.textContent).toContain('本次复习小结');
        expect(container.querySelectorAll('li')).toHaveLength(2);
        expect(container.querySelector('li a')?.textContent).toBe('原题摘要');
        expect(container.querySelector('li a')?.getAttribute('href')).toBe('/error-items/a');
    });

    it('列表题量默认 20，切换 10/全部后一次点击链接携带自动开始标记', async () => {
        mocks.get.mockImplementation(async (url: string) => url === '/api/notebooks'
            ? [{ id: 'math', name: '数学' }] : { items: [], total: 0, totalPages: 0 });
        await render(<ReviewPage />);
        const select = [...container.querySelectorAll('select')].find(node => [...node.options].some(option => option.value === 'all'))!;
        const link = () => [...container.querySelectorAll('a')].find(node => node.textContent === '开始复习')!;
        expect(select.value).toBe('20');
        expect(link().getAttribute('href')).toBe('/review/session?limit=20&autostart=1');
        const subject = [...container.querySelectorAll('select')].find(node => [...node.options].some(option => option.value === 'math'))!;
        await act(async () => { subject.value = 'math'; subject.dispatchEvent(new Event('change', { bubbles: true })); });
        for (const limit of ['10', 'all']) {
            await act(async () => { select.value = limit; select.dispatchEvent(new Event('change', { bubbles: true })); });
            expect(link().getAttribute('href')).toBe(`/review/session?subjectId=math&limit=${limit}&autostart=1`);
        }
    });

    it('带标记自动开始、加载时隐藏设置，移除标记且严格模式只请求一次', async () => {
        window.history.replaceState(null, '', '/review/session?subjectId=math&limit=10&autostart=1');
        let resolve!: (value: { items: typeof snapshot }) => void;
        mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        await render(<StrictMode><ReviewSession initialSubjectId="math" initialLimit="10" autostart /></StrictMode>);
        expect(container.querySelector('[role="status"]')).toBeTruthy();
        expect(container.querySelector('select')).toBeNull();
        expect(mocks.replace).toHaveBeenCalledWith('/review/session?subjectId=math&limit=10', { scroll: false });
        expect(mocks.get.mock.calls.filter(([url]) => url.startsWith('/api/review/due'))).toHaveLength(1);
        await act(async () => resolve({ items: snapshot }));
        expect(container.textContent).toContain('第 1 / 2 题');
        await render(<ReviewSession initialSubjectId="math" initialLimit="10" />);
        expect(container.querySelector('select')).toBeTruthy();
    });

    it('保存成功后锁定方式，点击下一题继续固定队列，最后小结使用服务端日期', async () => {
        mocks.post.mockResolvedValueOnce({ correct: true, reason: '答案正确' })
            .mockResolvedValueOnce({ result: 'correct', reviewPlan: { stage: 1, nextReviewAt: '2026-11-09T16:00:00Z' } });
        await render(<ReviewSession initialSubjectId="math" initialLimit="10" />);
        await act(async () => button('开始复习').click());
        await answer('本次作答');
        await act(async () => button('提交答案').click());
        await act(async () => button('保存结果').click());
        expect(button('重做原题').disabled).toBe(true);
        expect(button('举一反三').disabled).toBe(true);
        expect(container.textContent).toContain('第 1 / 2 题');
        await act(async () => button('下一题').click());
        expect(container.textContent).toContain('第 2 / 2 题');
        await act(async () => button('跳过').click());
        expect(container.textContent).toContain('本次复习小结');
        expect([...container.querySelectorAll('dd')].map(element => element.textContent)).toEqual(['1', '0', '1']);
        expect(container.textContent).toContain('2026-11-10');
        expect(mocks.get.mock.calls.filter(([url]) => url.startsWith('/api/review/due'))).toHaveLength(1);
    });

    it('加载失败可重试，未取得快照时不显示空小结', async () => {
        mocks.get.mockRejectedValueOnce(new Error('网络中断'));
        // 首次请求是科目列表；会话开始请求单独失败。
        await render(<ReviewSession initialSubjectId="" initialLimit="10" />);
        mocks.get.mockRejectedValueOnce(new Error('网络中断'));
        await act(async () => button('开始复习').click());
        expect(container.querySelector('[role="alert"]')).toBeTruthy();
        expect(container.textContent).not.toContain('本次复习小结');
        await act(async () => button('开始复习').click());
        expect(container.textContent).toContain('第 1 / 2 题');
    });

    it('原题初始隐藏解答，AI 判题后展示原错答对比，经用户确认才保存', async () => {
        const onSaved = vi.fn();
        mocks.post.mockResolvedValueOnce({ correct: false, reason: '缺少步骤' }).mockResolvedValueOnce({ result: 'correct', reviewPlan: { stage: 1, nextReviewAt: '2026-11-10T00:00:00Z' } });
        await render(<OriginalReview id="a" onSaved={onSaved} onBusyChange={() => {}} />);
        expect(container.textContent).toContain('原题题干');
        for (const text of ['标准答案', '详细解析', '过去的错答']) expect(container.textContent).not.toContain(text);
        expect(mocks.post).not.toHaveBeenCalled();
        await answer('本次作答');
        await act(async () => button('提交答案').click());
        expect(mocks.post).toHaveBeenCalledWith('/api/practice/grade', expect.objectContaining({ mode: 'original', errorItemId: 'a', userAnswer: '本次作答' }), { recoverable: true, timeout: 180000 });
        for (const text of ['标准答案', '详细解析', '过去的错答', '本次作答']) expect(container.textContent).toContain(text);
        expect(container.querySelectorAll('[role="radio"]')).toHaveLength(2);
        await act(async () => button('做对').click());
        await act(async () => button('保存结果').click());
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ source: 'review', result: 'correct', includeReviewPlan: true }));
        expect(mocks.post.mock.calls.at(-1)?.[1]).not.toHaveProperty('questionText');
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ result: 'correct' }));
    });

    it('AI 判题失败时保留作答，仍可核对答案并手动确认', async () => {
        mocks.post.mockRejectedValueOnce(new Error('超时'));
        await render(<OriginalReview id="a" onSaved={vi.fn()} onBusyChange={vi.fn()} />);
        await answer('保留答案');
        await act(async () => button('提交答案').click());
        expect(container.textContent).toContain('标准答案');
        expect(container.querySelector<HTMLTextAreaElement>('#review-answer')?.value).toBe('保留答案');
        expect(container.querySelectorAll('[role="radio"]')).toHaveLength(2);
    });

    it('只有切到举一反三才加载练习，保留原题草稿且不预取下一题', async () => {
        await render(<ReviewQuestion item={snapshot[0]} last={false} onComplete={vi.fn()} />);
        await answer('原题草稿');
        expect(mocks.get.mock.calls.some(([url]) => url.startsWith('/api/practice/generate'))).toBe(false);
        await act(async () => button('举一反三').click());
        expect(mocks.get).toHaveBeenCalledWith('/api/practice/generate?errorItemId=a');
        expect(mocks.post).not.toHaveBeenCalled();
        await act(async () => button('重做原题').click());
        expect(container.querySelector<HTMLTextAreaElement>('#review-answer')?.value).toBe('原题草稿');
    });

    it('小结显示对错、跳过与每题下次日期，完成轮次有独立提示', async () => {
        const outcomes: ReviewOutcome[] = [
            { id: 'a', result: 'correct', nextReviewAt: null },
            { id: 'b', result: 'wrong', nextReviewAt: '2026-11-08T16:00:00Z' },
            { id: 'c', result: 'skipped', nextReviewAt: '2026-11-07T16:00:00Z' },
        ];
        await render(<ReviewSummary items={outcomes} outcomes={outcomes} />);
        expect(container.querySelectorAll('dd')).toHaveLength(3);
        expect([...container.querySelectorAll('dd')].map(element => element.textContent)).toEqual(['1', '1', '1']);
        for (const text of ['已完成全部复习轮次', '2026-11-09', '仍待复习']) expect(container.textContent).toContain(text);
        expect(container.textContent).not.toContain('2026-11-08');
    });
});
