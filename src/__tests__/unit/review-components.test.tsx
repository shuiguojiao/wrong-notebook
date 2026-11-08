import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OriginalReview } from '@/components/review/original-review';
import { ReviewSession } from '@/components/review/review-session';
import { ReviewSummary } from '@/components/review/review-summary';
import { LanguageProvider } from '@/contexts/LanguageContext';
import type { ReviewOutcome } from '@/lib/review-session';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn(), push: vi.fn(), replace: vi.fn(), confirm: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get, post: mocks.post, delete: mocks.delete }, ApiError: class extends Error {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock('@/lib/feedback', () => ({ confirmDialog: mocks.confirm }));
vi.mock('@/contexts/TimeZoneContext', () => ({ useTimeZone: () => ({ timeZone: 'Asia/Shanghai' }) }));

let root: Root;
let container: HTMLDivElement;
const item = { id: 'a', questionText: '原题题干', answerText: '标准答案', analysis: '解析正文', wrongAnswerText: '过去的错答', originalImageUrl: '/test.png' };
const snapshot = [{ id: 'a', subjectName: '数学', questionPreview: '原题摘要', nextReviewAt: '2026-11-07T16:00:00Z' }, { id: 'b', subjectName: '英语', nextReviewAt: '2026-11-07T16:00:00Z' }];
const record = { id: 'r1', result: 'correct', reviewPlan: { stage: 1, nextReviewAt: '2026-11-09T16:00:00Z' } };
const active = () => container.querySelector<HTMLElement>('[data-review-question]:not([hidden])') ?? container;
async function render(node: ReactNode) { await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>)); }
function button(text: string) {
    const found = [...container.querySelectorAll('button')].find(element => !element.closest('[hidden], .hidden') && (element.textContent === text || element.getAttribute('aria-label') === text));
    expect(found, text).toBeTruthy(); return found!;
}
async function click(text: string) { await act(async () => button(text).click()); }
async function answer(text: string) {
    const field = active().querySelector<HTMLTextAreaElement>('#review-answer')!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, text);
        field.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
async function grade() {
    mocks.post.mockResolvedValueOnce({ correct: true, reason: '答案正确' });
    await answer('本次作答'); await click('提交');
}
async function save() { mocks.post.mockResolvedValueOnce(record); await click('对，不太确定'); }

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    localStorage.setItem('language', 'zh'); sessionStorage.clear();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    mocks.post.mockReset(); mocks.delete.mockReset().mockResolvedValue({ success: true }); mocks.confirm.mockResolvedValue(true);
    mocks.get.mockReset().mockImplementation(async (url: string) => {
        if (url.startsWith('/api/review/due')) return { items: snapshot };
        if (url === '/api/settings') return {};
        return item;
    });
});
afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('专注复习会话', () => {
    it('直接进入就自动开始默认 20 题，无开始前设置；跳过沿用固定队列', async () => {
        await render(<ReviewSession initialSubjectId="math" />);
        expect(mocks.get).toHaveBeenCalledWith('/api/review/due?format=ids&limit=20&subjectId=math');
        expect(container.querySelector('select')).toBeTruthy(); // 手写工具的设置仍存在，但无题量或科目选择。
        expect(container.textContent).not.toContain('本次题量');
        expect(active().textContent).toContain('数学 · 1 / 2');
        await click('跳过');
        expect(active().textContent).toContain('英语 · 2 / 2');
        expect(mocks.get).toHaveBeenCalledWith('/api/error-items/b');
        expect(mocks.get.mock.calls.filter(([url]) => url.startsWith('/api/review/due'))).toHaveLength(1);
        expect(mocks.post).not.toHaveBeenCalled();
        await click('跳过');
        expect(container.textContent).toContain('本次复习小结');
        expect(container.querySelector('li a')?.textContent).toBe('原题摘要');
        expect(container.querySelector('li a')?.getAttribute('href')).toBe('/error-items/a');
    });
    it('严格模式只请求一次快照并移除自动开始标记，加载时没有设置卡', async () => {
        window.history.replaceState(null, '', '/review/session?subjectId=math&autostart=1');
        let resolve!: (value: { items: typeof snapshot }) => void;
        mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        await render(<StrictMode><ReviewSession initialSubjectId="math" /></StrictMode>);
        expect(container.querySelector('[role="status"]')).toBeTruthy(); expect(container.querySelector('select')).toBeNull();
        expect(mocks.replace).toHaveBeenCalledWith('/review/session?subjectId=math', { scroll: false });
        expect(mocks.get).toHaveBeenCalledTimes(1);
        await act(async () => resolve({ items: snapshot }));
        expect(active().textContent).toContain('数学 · 1 / 2');
    });
    it('空提交保持可点并提示；思路默认收起且不显示输入方式说明', async () => {
        await render(<ReviewSession initialSubjectId="" />);
        expect(button('提交').disabled).toBe(false);
        expect(active().querySelector('details')?.open).toBe(false);
        expect(active().textContent).not.toContain('文字与笔迹');
        await click('提交');
        expect(active().querySelector('[role="alert"]')?.textContent).toContain('请先填写答案或手写作答');
        expect(mocks.post).not.toHaveBeenCalled();
    });
    it('提交后隐藏跳过，展示并排对比与折叠解析，确认一次自动继续并小结', async () => {
        await render(<ReviewSession initialSubjectId="math" />); await grade();
        expect(active().textContent).toContain('AI 判断：做对了');
        for (const text of ['这次', '上次错答', '过去的错答', '本次作答', '标准答案']) expect(active().textContent).toContain(text);
        expect([...active().querySelectorAll('button')].some(node => node.textContent === '跳过')).toBe(false);
        const analysis = [...active().querySelectorAll('details')].find(node => node.textContent?.includes('解析正文'))!;
        expect(analysis.open).toBe(false);
        expect(active().querySelector('a')?.textContent).toBe('换一道类似题');
        expect(mocks.post).toHaveBeenCalledTimes(1);
        await save();
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ source: 'review', result: 'correct', includeReviewPlan: true }));
        expect(mocks.post.mock.calls.at(-1)?.[1]).not.toHaveProperty('questionText');
        expect(active().textContent).toContain('英语 · 2 / 2');
        expect(active().textContent).not.toContain('保存结果'); expect(active().textContent).not.toContain('下一题');
        await click('跳过');
        expect([...container.querySelectorAll('dd')].map(element => element.textContent)).toEqual(['1', '0', '1']);
        expect(container.textContent).toContain('2026-11-10');
        expect(mocks.get.mock.calls.filter(([url]) => url.startsWith('/api/review/due'))).toHaveLength(1);
    });
    it('判题后提供三个确认入口，有把握保存 sure 并立即前进', async () => {
        await render(<ReviewSession initialSubjectId="" />); await grade();
        expect(button('对，不太确定')).toBeTruthy(); expect(button('对，有把握')).toBeTruthy(); expect(button('其实做错了')).toBeTruthy();
        expect(button('对，有把握').className).toContain('bg-primary');
        expect(button('对，不太确定').className).not.toContain('bg-primary text-primary-foreground');
        mocks.post.mockResolvedValueOnce(record); await click('对，有把握');
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ confidence: 'sure', result: 'correct', source: 'review' }));
        expect(active().textContent).toContain('英语 · 2 / 2');
    });
    it('AI 判错时突出错误确认，人工可改选不太确定', async () => {
        await render(<ReviewSession initialSubjectId="" />);
        mocks.post.mockResolvedValueOnce({ correct: false, reason: '缺少条件' }); await answer('答案'); await click('提交');
        expect(button('做错了').className).toContain('bg-primary');
        mocks.post.mockResolvedValueOnce(record); await click('对，不太确定');
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ confidence: 'unsure', result: 'correct' }));
    });
    it('保存失败停留本题、保留答案，恢复按钮后可重试，连点不会重复保存', async () => {
        await render(<ReviewSession initialSubjectId="" />); await grade();
        mocks.post.mockRejectedValueOnce(new Error('网络中断'));
        await click('对，不太确定');
        expect(active().textContent).toContain('数学 · 1 / 2'); expect(active().textContent).toContain('本次作答');
        expect(active().querySelector('[role="alert"]')).toBeTruthy(); expect(button('其实做错了').disabled).toBe(false);
        mocks.post.mockResolvedValueOnce(record);
        await act(async () => { const control = button('对，不太确定'); control.click(); control.click(); });
        expect(mocks.post.mock.calls.filter(([url]) => url === '/api/practice/record')).toHaveLength(2);
        expect(active().textContent).toContain('英语 · 2 / 2');
    });
    it('撤销删除刚写入记录并回到上一题判题界面，重新确认可以再次保存', async () => {
        await render(<ReviewSession initialSubjectId="" />); await grade(); await save();
        await click('撤销复习结果');
        expect(mocks.delete).toHaveBeenCalledWith('/api/review/undo?recordId=r1');
        expect(active().textContent).toContain('数学 · 1 / 2'); expect(active().textContent).toContain('本次作答');
        expect(active().textContent).toContain('AI 判断：做对了'); expect(button('对，不太确定').disabled).toBe(false);
        expect(mocks.post.mock.calls.filter(([url]) => url === '/api/practice/grade')).toHaveLength(1);
        await save(); expect(active().textContent).toContain('英语 · 2 / 2');
    });
    it('跳过后仍保留五秒撤销入口，撤销回退保存及后续跳过进度', async () => {
        await render(<ReviewSession initialSubjectId="" />); await grade(); await save(); await click('跳过');
        expect(container.textContent).toContain('本次复习小结'); await click('撤销复习结果');
        expect(active().textContent).toContain('数学 · 1 / 2');
        expect(container.textContent).not.toContain('本次复习小结');
        expect(mocks.delete).toHaveBeenCalledWith('/api/review/undo?recordId=r1');
    });
    it('下一题有草稿时撤销先确认，取消保留草稿且不调用删除接口', async () => {
        await render(<ReviewSession initialSubjectId="" />); await grade(); await save(); await answer('下一题草稿');
        mocks.confirm.mockResolvedValueOnce(false); await click('撤销复习结果');
        expect(mocks.delete).not.toHaveBeenCalled();
        expect(active().querySelector<HTMLTextAreaElement>('#review-answer')?.value).toBe('下一题草稿');
        await click('撤销复习结果'); expect(active().textContent).toContain('数学 · 1 / 2');
    });
    it('首次只展示题干，未作答前不加载解答或生成任何变式', async () => {
        await render(<OriginalReview id="a" onSaved={vi.fn()} />);
        expect(container.textContent).toContain('原题题干');
        for (const text of ['标准答案', '解析正文', '过去的错答', '换一道类似题']) expect(container.textContent).not.toContain(text);
        expect(mocks.post).not.toHaveBeenCalled();
        expect(mocks.get.mock.calls.some(([url]) => url.startsWith('/api/practice/generate'))).toBe(false);
    });
    it('最后一题保存后在小结上仍可撤销', async () => {
        mocks.get.mockImplementationOnce(async () => ({ items: snapshot.slice(0, 1) }));
        await render(<ReviewSession initialSubjectId="" />); await grade(); await save();
        expect(container.textContent).toContain('本次复习小结');
        await click('撤销复习结果'); expect(active().textContent).toContain('数学 · 1 / 1');
        expect(container.textContent).not.toContain('本次复习小结');
    });
    it('撤销失败不倒退进度，可再次重试', async () => {
        await render(<ReviewSession initialSubjectId="" />); await grade(); await save();
        mocks.delete.mockRejectedValueOnce(new Error('离线'));
        await click('撤销复习结果'); expect(active().textContent).toContain('英语 · 2 / 2');
        expect(container.textContent).toContain('撤销失败'); expect(button('撤销复习结果').disabled).toBe(false);
        await click('撤销复习结果'); expect(active().textContent).toContain('数学 · 1 / 2');
    });
    it('撤销提示约 5 秒消失', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        await render(<ReviewSession initialSubjectId="" />); await grade(); await save();
        await act(async () => vi.advanceTimersByTime(4999)); expect(button('撤销复习结果')).toBeTruthy();
        await act(async () => vi.advanceTimersByTime(1)); expect(container.textContent).not.toContain('已记录为');
    });
    it('关闭有草稿时确认放弃，取消仍留在本题；确认后返回并保留进度提示', async () => {
        await render(<ReviewSession initialSubjectId="" />); await answer('草稿');
        mocks.confirm.mockResolvedValueOnce(false);
        await click('关闭复习'); expect(mocks.push).not.toHaveBeenCalled();
        expect(active().querySelector<HTMLTextAreaElement>('#review-answer')?.value).toBe('草稿');
        await click('关闭复习'); expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining('放弃本题作答'), { destructive: true });
        expect(mocks.push).toHaveBeenCalledWith('/review'); expect(sessionStorage.getItem('review-completed')).toBe('0');
    });
    it('加载失败可以重试，空快照只显示空状态而非小结', async () => {
        mocks.get.mockRejectedValueOnce(new Error('网络中断'));
        await render(<ReviewSession initialSubjectId="" />);
        expect(container.querySelector('[role="alert"]')).toBeTruthy(); expect(container.textContent).not.toContain('本次复习小结');
        mocks.get.mockResolvedValueOnce({ items: [] }); await click('重试');
        expect(container.textContent).toContain('今天没有需要复习的错题'); expect(container.textContent).not.toContain('本次复习小结');
    });
    it('AI 判题失败保留答案并允许手动确认，不自动写记录', async () => {
        mocks.post.mockRejectedValueOnce(new Error('超时'));
        await render(<OriginalReview id="a" onSaved={vi.fn()} />); await answer('保留答案'); await click('提交');
        expect(container.textContent).toContain('请自己核对答案'); expect(container.textContent).toContain('保留答案');
        expect(container.textContent).toContain('标准答案'); expect(button('对，不太确定').disabled).toBe(false);
        expect(button('做错了').disabled).toBe(false);
        expect(container.textContent).not.toContain('其实做错了');
        for (const label of ['对，不太确定', '对，有把握', '做错了']) {
            expect(button(label).classList.contains('bg-primary')).toBe(false);
            expect(button(label).classList.contains('hover:bg-accent')).toBe(false);
        }
        expect(mocks.post).toHaveBeenCalledTimes(1);
    });
    it('小结保留三个数字、题干链接和服务端下次日期，返回首页', async () => {
        const outcomes: ReviewOutcome[] = [
            { id: 'a', result: 'correct', nextReviewAt: null },
            { id: 'b', result: 'wrong', nextReviewAt: '2026-11-08T16:00:00Z' },
            { id: 'c', result: 'skipped', nextReviewAt: '2026-11-07T16:00:00Z' },
        ];
        await render(<ReviewSummary items={outcomes} outcomes={outcomes} />);
        expect([...container.querySelectorAll('dd')].map(element => element.textContent)).toEqual(['1', '1', '1']);
        for (const text of ['复习完成', '2026-11-09', '仍待复习', '返回首页']) expect(container.textContent).toContain(text);
        expect(container.textContent).not.toContain('2026-11-08'); expect(container.textContent).not.toContain('再来一组');
    });
});
