import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OriginalReview } from '@/components/review/original-review';
import { ReviewSession } from '@/components/review/review-session';
import { ReviewSummary } from '@/components/review/review-summary';
import { FocusShellContext } from '@/contexts/FocusShellContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import type { ReviewOutcome } from '@/lib/review-session';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn(), push: vi.fn(), replace: vi.fn(), confirm: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (url: string) => url === '/api/student-progress' ? Promise.reject(new Error('进度取数失败')) : url === '/api/user' ? Promise.resolve({ rewardsEnabled: true }) : url === '/api/rewards/summary' ? Promise.resolve({ enabled: false }) : mocks.get(url), post: mocks.post, delete: mocks.delete }, ApiError: class extends Error {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock('@/lib/feedback', () => ({ confirmDialog: mocks.confirm }));
vi.mock('@/contexts/TimeZoneContext', () => ({ useTimeZone: () => ({ timeZone: 'Asia/Shanghai' }) }));

let root: Root;
let container: HTMLDivElement;
const item = { id: 'a', questionText: '原题题干', answerText: '标准答案', analysis: '解析正文', wrongAnswerText: '过去的错答', originalImageUrl: '/test.png' };
const snapshot = [{ id: 'a', subjectName: '数学', questionPreview: '原题摘要', nextReviewAt: '2026-11-07T16:00:00Z' }, { id: 'b', subjectName: '英语', nextReviewAt: '2026-11-07T16:00:00Z' }];
const record = { rewards: [{ type: 'review', points: 1, meta: {}, createdAt: '2026-11-11T04:00:00Z' }], id: 'r1', result: 'correct', reviewPlan: { stage: 1, nextReviewAt: '2026-11-09T16:00:00Z' } };
const active = () => container.querySelector<HTMLElement>('[data-review-question]:not([hidden])') ?? container;
async function render(node: ReactNode) { await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>)); }
function button(text: string) {
    const found = [...container.querySelectorAll('button')].find(element => !element.closest('[hidden], .hidden') && (element.textContent === text || element.getAttribute('aria-label') === text));
    expect(found, text).toBeTruthy(); return found!;
}
async function click(text: string) { await act(async () => button(text).click()); }
async function answer(text: string) {
    const field = active().querySelector<HTMLTextAreaElement>('textarea[id^="review-answer-"]')!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, text);
        field.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
async function grade() {
    mocks.post.mockResolvedValueOnce({ correct: true, reason: '答案正确' });
    await answer('本次作答'); await click('提交，看看对不对');
}
async function save() { mocks.post.mockResolvedValueOnce(record); await click('还不太熟'); }

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
    it.each([390, 834, 1180])('%spx 作答共用完整题目与便签，提交按 md 断点切换顶部和底部位置', async width => {
        vi.stubGlobal('innerWidth', width);
        await render(<ReviewSession initialSubjectId="" />);
        const question = active();
        expect(question.querySelector('[data-answering="true"]')).toBeTruthy();
        expect(question.querySelector('.review-prompt[data-paper="paper"]')?.textContent).toContain('原题题干');
        expect(question.querySelector('.review-response[data-paper="note"]')).toBeTruthy();
        expect(question.querySelectorAll('.review-answer-action button')).toHaveLength(1);
        const topSubmit = question.querySelector('.answer-input-heading .answer-submit-top')!;
        expect(topSubmit.classList.contains('md:block')).toBe(true);
        expect(topSubmit.querySelector('button')?.classList.contains('min-h-11')).toBe(true);
        expect(button('提交，看看对不对')).toBeTruthy();
        expect(question.querySelector('[role="dialog"], [aria-modal], img, a[href^="/checks"]')).toBeNull();
        const css = readFileSync('src/app/globals.css', 'utf8');
        expect(css).toContain('.review-focus-layout .review-answer-action { display: none; }');
        expect(css).toContain('.review-drawer .review-answer-body { padding-bottom: 3rem; }');
        if (width < 768) {
            expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.review-drawer\s*\{\s*position: fixed/);
            expect(question.querySelector('[data-drawer-size="normal"]')).toBeTruthy();
        } else if (width < 1024) {
            expect(css).toMatch(/@media \(min-width: 768px\)[\s\S]*?\.review-drawer \.review-response \{ min-height: 26rem/);
            expect(question.querySelector('.review-action-bar')?.classList.contains('fixed')).toBe(true);
        } else {
            expect(css).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*?\.review-answer-layout \{[\s\S]*?grid-template-columns: minmax\(0, 55fr\) minmax\(0, 45fr\)/);
            expect(css).toContain('.review-answer-layout > .review-prompt { min-height: 0; overflow-y: auto; }');
            const submit = question.querySelector('.review-answer-action')!;
            expect(submit.previousElementSibling?.classList.contains('review-answer-body')).toBe(true);
            expect(question.querySelector('.review-answer-body .review-action-bar')).toBeNull();
        }
    });
    it('仅宽屏限制卡片高度，两栏正文独立滚动且操作栏不收缩、不遮住正文', () => {
        const css = readFileSync('src/app/globals.css', 'utf8');
        const wide = css.match(/@media \(min-width: 1024px\) \{([\s\S]*?)\n\}/)![1];
        expect(wide).toMatch(/\.review-focus-layout:has\(\.review-answer-layout\) \{[^}]*height: calc\(100dvh - 2 \* var\(--review-page-inset, 1rem\) - env\(safe-area-inset-bottom, 0px\)\);[^}]*min-height: 0;[^}]*padding-bottom: 0;/);
        expect(wide).toContain('.review-focus-layout:has(.review-answer-layout) > header { flex: none; }');
        expect(wide).toMatch(/\.review-focus-layout:has\(\.review-answer-layout\) > div \{[^}]*flex: 1;[^}]*min-height: 0;/);
        expect(wide).toMatch(/\.review-answer-layout \{[^}]*grid-template-rows: minmax\(0, 1fr\);[^}]*min-height: 0;/);
        expect(wide).toContain('.review-answer-layout > .review-prompt { min-height: 0; overflow-y: auto; }');
        expect(wide).toMatch(/\.review-feedback-body \{[^}]*display: flex;[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow-y: auto;/);
        expect(wide).toMatch(/\.review-answer-layout > \.review-response > \.review-action-bar \{[^}]*position: static;[^}]*flex: none;/);
        expect(wide).toContain('.review-focus-layout .review-answer-action { position: static; background: transparent; padding: 0; }');
        expect(css).toContain('.review-feedback-body { display: contents; }');
    });
    it.each([
        { correct: true, labels: ['还不太熟', '会了，下一题'] },
        { correct: false, labels: ['明天再见', '我觉得我是对的'] },
        { correct: null, labels: ['没做对', '还不太熟', '会了'] },
    ])('长材料对照时，自评与可滚动正文分离且顺序保持不变（判题 $correct）', async ({ correct, labels }) => {
        vi.stubGlobal('innerWidth', 1180);
        vi.stubGlobal('innerHeight', 820);
        const longText = '长阅读材料。'.repeat(600);
        mocks.get.mockImplementation(async (url: string) => {
            if (url.startsWith('/api/review/due')) return { items: snapshot };
            if (url === '/api/settings') return {};
            return { ...item, questionText: longText, analysis: '长解析。'.repeat(300) };
        });
        if (correct === null) mocks.post.mockReturnValueOnce(new Promise(() => {}));
        else mocks.post.mockResolvedValueOnce({ correct, reason: '对照提示。'.repeat(100) });
        await render(<ReviewSession initialSubjectId="" />);
        await answer('本次长材料作答');
        await click('提交，看看对不对');
        await click('展开全文');
        const layout = active().querySelector('[data-answering="false"]')!;
        const prompt = layout.querySelector('.review-prompt')!;
        expect(prompt.textContent).toContain(longText);
        expect(prompt.querySelector('[data-paper] img')).toBeTruthy();
        const response = layout.querySelector(':scope > .review-response')!;
        const body = response.querySelector('.review-feedback-body')!;
        const actions = response.querySelector(':scope > .review-action-bar')!;
        expect(body.textContent).toContain('本次长材料作答');
        expect(body.textContent).toContain('标准答案');
        expect(body.nextElementSibling).toBe(actions);
        expect(body.querySelector('.review-action-bar')).toBeNull();
        expect([...actions.querySelectorAll('button')].map(node => node.textContent)).toEqual(labels);
        expect(actions.querySelector('[tabindex]')).toBeNull();
    });
    it('手机长题按六行实测折叠，展开与收起保留全文、答案及输入节点', async () => {
        vi.stubGlobal('innerWidth', 390);
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
            return this.classList.contains('review-question-text') ? 400 : 0;
        });
        await render(<OriginalReview id="a" onSaved={vi.fn()} />);
        const text = container.querySelector('.review-question-text')!;
        const field = container.querySelector('textarea');
        expect(text.getAttribute('data-collapsed')).toBe('true');
        expect(button('展开全文').getAttribute('aria-expanded')).toBe('false');
        await answer('折叠草稿');
        await click('展开全文');
        expect(text.getAttribute('data-collapsed')).toBe('false');
        expect(text.textContent).toContain('原题题干');
        await click('收起全文');
        expect(text.getAttribute('data-collapsed')).toBe('true');
        expect(container.querySelector('textarea')).toBe(field);
        expect(field?.value).toBe('折叠草稿');
    });
    it('短题没有全文开关，抽屉按钮和方向键均保留草稿且不创建模态层', async () => {
        vi.stubGlobal('innerWidth', 390);
        await render(<OriginalReview id="a" onSaved={vi.fn()} />);
        expect(container.textContent).not.toContain('展开全文');
        await answer('抽屉草稿');
        const drawer = container.querySelector('.review-drawer')!;
        const handle = container.querySelector<HTMLButtonElement>('.review-drawer-handle')!;
        const field = container.querySelector('textarea');
        await act(async () => handle.click());
        expect(drawer.getAttribute('data-drawer-size')).toBe('expanded');
        await act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
        expect(drawer.getAttribute('data-drawer-size')).toBe('collapsed');
        expect(handle.getAttribute('aria-expanded')).toBe('false');
        await click('提交，看看对不对');
        // 有答案时进入对照，不会因为抽屉收起而丢失已输入的内容。
        expect(container.textContent).toContain('抽屉草稿');
        expect(field?.value).toBe('抽屉草稿');
        expect(container.querySelector('[role="dialog"], [aria-modal]')).toBeNull();
    });
    it('抽屉上拉放大、下拉收起和空提交提示，视觉视口缩小时重新测量安全留位', async () => {
        vi.stubGlobal('innerWidth', 390);
        const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
        vi.stubGlobal('innerHeight', 844);
        vi.stubGlobal('visualViewport', viewport);
        await render(<ReviewSession initialSubjectId="" />);
        const handle = container.querySelector<HTMLButtonElement>('.review-drawer-handle')!;
        const drawer = container.querySelector('.review-drawer')!;
        async function drag(from: number, to: number) {
            await act(async () => {
                for (const [type, y] of [['pointerdown', from], ['pointerup', to]] as const) {
                    const event = new Event(type, { bubbles: true });
                    Object.assign(event, { pointerId: 1, button: 0, clientY: y });
                    handle.dispatchEvent(event);
                }
                handle.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
            });
        }
        await drag(400, 300);
        expect(drawer.getAttribute('data-drawer-size')).toBe('expanded');
        await drag(300, 400);
        expect(drawer.getAttribute('data-drawer-size')).toBe('collapsed');
        await click('提交，看看对不对');
        expect([...drawer.querySelectorAll('[role="alert"]')].some(node => !node.closest('.review-answer-body'))).toBe(true);
        viewport.height = 480;
        await act(async () => viewport.dispatchEvent(new Event('resize')));
        const layout = active().querySelector<HTMLElement>('[data-review-layout]')!;
        expect(layout.style.getPropertyValue('--review-keyboard-inset')).toBe('364px');
        expect(layout.style.getPropertyValue('--review-viewport-height')).toBe('480px');
        await act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
        expect(drawer.getAttribute('data-drawer-size')).toBe('expanded');
    });
    it('进度使用剩余队列估时，跳过后相应减少；旧快照不编造估时', async () => {
        mocks.get.mockResolvedValueOnce({ items: snapshot.map((entry, index) => ({ ...entry, estimatedSec: index ? 120 : 240 })) });
        await render(<ReviewSession initialSubjectId="" />);
        expect(active().querySelector('h2')?.textContent).toBe('数学 · 第 1 题 / 共 2 题 · 还剩约 6 分钟');
        await click('跳过');
        expect(active().querySelector('h2')?.textContent).toBe('英语 · 第 2 题 / 共 2 题 · 还剩约 2 分钟');
    });
    it('快照加载默认专注，无内容错误释放，重试加载撤回释放，空队列恢复导航', async () => {
        let releasedPath: string | null = null;
        const setReleasedFocusPath: Dispatch<SetStateAction<string | null>> = value => { releasedPath = typeof value === 'function' ? value(releasedPath) : value; };
        let reject!: (error: Error) => void;
        mocks.get.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
        await render(<FocusShellContext.Provider value={{ pathname: '/review/session', setReleasedFocusPath }}><ReviewSession initialSubjectId="" /></FocusShellContext.Provider>);
        expect(releasedPath).toBeNull();
        expect(container.querySelector('[role="status"]')).not.toBeNull();
        await act(async () => reject(new Error('加载队列失败')));
        expect(releasedPath).toBe('/review/session');
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
        let resolve!: (value: { items: typeof snapshot }) => void;
        mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        await click('重试');
        expect(releasedPath).toBeNull();
        await act(async () => resolve({ items: [] }));
        expect(releasedPath).toBe('/review/session');
        expect(container.textContent).toContain('今天没有需要复习的错题');
    });
    it('实际题目加载失败释放专注，重试成功及收工小结保持专注', async () => {
        let releasedPath: string | null = null;
        const setReleasedFocusPath: Dispatch<SetStateAction<string | null>> = value => { releasedPath = typeof value === 'function' ? value(releasedPath) : value; };
        mocks.get.mockImplementation(async (url: string) => {
            if (url.startsWith('/api/review/due')) return { items: snapshot.slice(0, 1) };
            if (url === '/api/settings') return {};
            throw new Error('加载题目失败');
        });
        await render(<FocusShellContext.Provider value={{ pathname: '/review/session', setReleasedFocusPath }}><ReviewSession initialSubjectId="" /></FocusShellContext.Provider>);
        expect(releasedPath).toBe('/review/session'); expect(container.querySelector('[role="alert"]')).not.toBeNull();
        mocks.get.mockResolvedValue(item); await click('重试');
        expect(releasedPath).toBeNull();
        await click('跳过'); expect(releasedPath).toBeNull();
        expect(container.textContent).toContain('这一组做完啦');
    });
    it('跳过加载失败的题后撤回释放，不影响下一张卡或收工小结', async () => {
        let releasedPath: string | null = null;
        const setReleasedFocusPath: Dispatch<SetStateAction<string | null>> = value => { releasedPath = typeof value === 'function' ? value(releasedPath) : value; };
        mocks.get.mockImplementation(async (url: string) => {
            if (url.startsWith('/api/review/due')) return { items: snapshot };
            if (url === '/api/error-items/a') throw new Error('加载题目失败');
            if (url === '/api/settings') return {};
            return item;
        });
        await render(<FocusShellContext.Provider value={{ pathname: '/review/session', setReleasedFocusPath }}><ReviewSession initialSubjectId="" /></FocusShellContext.Provider>);
        expect(releasedPath).toBe('/review/session');
        await click('跳过');
        expect(releasedPath).toBeNull();
        expect(active().textContent).toContain('英语 · 第 2 题 / 共 2 题');
        await click('跳过');
        expect(releasedPath).toBeNull();
        expect(container.textContent).toContain('这一组做完啦');
    });
    it('直接进入就自动开始分钟队列，无开始前设置；跳过沿用固定队列', async () => {
        await render(<ReviewSession initialSubjectId="math" />);
        expect(mocks.get).toHaveBeenCalledWith('/api/review/due?format=ids&mode=today&subjectId=math');
        expect(container.querySelector('select')).toBeTruthy(); // 手写工具的设置仍存在，但无题量或科目选择。
        expect(container.textContent).not.toContain('本次题量');
        expect(active().textContent).toContain('数学 · 第 1 题 / 共 2 题');
        await click('跳过');
        expect(active().textContent).toContain('英语 · 第 2 题 / 共 2 题');
        expect(mocks.get).toHaveBeenCalledWith('/api/error-items/b');
        expect(mocks.get.mock.calls.filter(([url]) => url.startsWith('/api/review/due'))).toHaveLength(2);
        expect(mocks.post).not.toHaveBeenCalled();
        await click('跳过');
        expect(container.textContent).toContain('这一组做完啦');
        expect(container.querySelector('li a')).toBeNull();
        expect(container.textContent).toContain('跳过 2 题，仍需复习');
    });
    it('严格模式只请求一次快照并移除自动开始标记，加载时没有设置卡', async () => {
        window.history.replaceState(null, '', '/review/session?subjectId=math&autostart=1');
        let resolve!: (value: { items: typeof snapshot }) => void;
        mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        await render(<StrictMode><ReviewSession initialSubjectId="math" /></StrictMode>);
        expect(container.querySelector('[role="status"]')).toBeTruthy(); expect(container.querySelector('select')).toBeNull();
        expect(mocks.replace).toHaveBeenCalledWith('/review/session?subjectId=math', { scroll: false });
        expect(mocks.get).toHaveBeenCalledTimes(2);
        await act(async () => resolve({ items: snapshot }));
        expect(active().textContent).toContain('数学 · 第 1 题 / 共 2 题');
    });
    it('空提交保持可点并提示；思路默认收起且不显示输入方式说明', async () => {
        await render(<ReviewSession initialSubjectId="" />);
        expect(button('提交，看看对不对').disabled).toBe(false);
        expect(active().querySelector('details')?.open).toBe(false);
        expect(active().textContent).not.toContain('文字与笔迹');
        await click('提交，看看对不对');
        expect(active().querySelector('[role="alert"]')?.textContent).toContain('请先填写答案、手写作答或添加照片');
        expect(mocks.post).not.toHaveBeenCalled();
    });
    it('提交后隐藏跳过，展示竖排对照与折叠解析，确认一次自动继续并小结', async () => {
        await render(<ReviewSession initialSubjectId="math" />); await grade();
        expect(active().textContent).toContain('做对了');
        for (const text of ['你写的', '上次错答', '过去的错答', '本次作答', '标准答案', '参考答案']) expect(active().textContent).toContain(text);
        expect([...active().querySelectorAll('button')].some(node => node.textContent === '跳过')).toBe(false);
        const analysis = [...active().querySelectorAll('details')].find(node => node.textContent?.includes('解析正文'))!;
        expect(analysis.open).toBe(false);
        expect(active().querySelector('a')?.textContent).toBe('再来一道类似的');
        expect(mocks.post).toHaveBeenCalledTimes(1);
        await save();
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ source: 'review', result: 'correct', includeReviewPlan: true }));
        expect(mocks.post.mock.calls.at(-1)?.[1]).not.toHaveProperty('questionText');
        expect(active().textContent).toContain('英语 · 第 2 题 / 共 2 题');
        expect(active().textContent).not.toContain('保存结果'); expect(active().textContent).not.toContain('下一题');
        await click('跳过');
        expect([...container.querySelectorAll('section:not([data-review-layout]) > dl dd')].map(element => element.textContent)).toEqual(['1', '0', '–']);
        expect(container.textContent).toContain('跳过 1 题，仍需复习');
        expect(mocks.get.mock.calls.filter(([url]) => url.startsWith('/api/review/due'))).toHaveLength(2);
    });
    it('判对后提供两个把握入口，有把握保存 sure 并立即前进', async () => {
        await render(<ReviewSession initialSubjectId="" />); await grade();
        expect(button('还不太熟')).toBeTruthy(); expect(button('会了，下一题')).toBeTruthy();
        expect([...active().querySelectorAll('button')].some(node => node.textContent === '没做对')).toBe(false);
        expect(button('会了，下一题').className).toContain('bg-primary');
        expect(button('还不太熟').className).not.toContain('bg-primary text-primary-foreground');
        mocks.post.mockResolvedValueOnce(record); await click('会了，下一题');
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ confidence: 'sure', result: 'correct', source: 'review' }));
        expect(active().textContent).toContain('英语 · 第 2 题 / 共 2 题');
    });
    it('AI 判错时突出错误确认，人工可改选不太确定', async () => {
        await render(<ReviewSession initialSubjectId="" />);
        mocks.post.mockResolvedValueOnce({ correct: false, reason: '缺少条件' }); await answer('答案'); await click('提交，看看对不对');
        expect(button('明天再见').className).toContain('bg-primary');
        await click('我觉得我是对的');
        expect(mocks.post).toHaveBeenCalledTimes(1);
        expect(active().textContent).toContain('标准答案');
        mocks.post.mockResolvedValueOnce(record); await click('还不太熟');
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ confidence: 'unsure', result: 'correct' }));
    });
    it('保存失败停留本题、保留答案，恢复按钮后可重试，连点不会重复保存', async () => {
        let releasedPath: string | null = null;
        const setReleasedFocusPath: Dispatch<SetStateAction<string | null>> = value => { releasedPath = typeof value === 'function' ? value(releasedPath) : value; };
        await render(<FocusShellContext.Provider value={{ pathname: '/review/session', setReleasedFocusPath }}><ReviewSession initialSubjectId="" /></FocusShellContext.Provider>);
        await grade();
        mocks.post.mockRejectedValueOnce(new Error('网络中断'));
        await click('还不太熟');
        expect(active().textContent).toContain('数学 · 第 1 题 / 共 2 题'); expect(active().textContent).toContain('本次作答');
        expect(active().querySelector('[role="alert"]')).toBeTruthy(); expect(button('还不太熟').disabled).toBe(false);
        expect(releasedPath).toBeNull();
        mocks.post.mockResolvedValueOnce(record);
        await act(async () => { const control = button('还不太熟'); control.click(); control.click(); });
        expect(mocks.post.mock.calls.filter(([url]) => url === '/api/practice/record')).toHaveLength(2);
        expect(active().textContent).toContain('英语 · 第 2 题 / 共 2 题');
    });
    it('撤销删除刚写入记录并回到上一题判题界面，重新确认可以再次保存', async () => {
        await render(<ReviewSession initialSubjectId="" />); await grade(); await save();
        expect(container.querySelector('[data-reward-feedback]')?.textContent).toBe('+1 能量豆');
        await click('撤销复习结果');
        expect(container.querySelector('[data-reward-feedback]')).toBeNull();
        expect(mocks.delete).toHaveBeenCalledWith('/api/review/undo?recordId=r1');
        expect(active().textContent).toContain('数学 · 第 1 题 / 共 2 题'); expect(active().textContent).toContain('本次作答');
        expect(active().textContent).toContain('做对了'); expect(button('还不太熟').disabled).toBe(false);
        expect(mocks.post.mock.calls.filter(([url]) => url === '/api/practice/grade')).toHaveLength(1);
        await save(); expect(active().textContent).toContain('英语 · 第 2 题 / 共 2 题');
    });
    it('跳过后仍保留五秒撤销入口，撤销回退保存及后续跳过进度', async () => {
        await render(<ReviewSession initialSubjectId="" />); await grade(); await save(); await click('跳过');
        expect(container.textContent).toContain('这一组做完啦'); await click('撤销复习结果');
        expect(active().textContent).toContain('数学 · 第 1 题 / 共 2 题');
        expect(container.textContent).not.toContain('这一组做完啦');
        expect(mocks.delete).toHaveBeenCalledWith('/api/review/undo?recordId=r1');
    });
    it('下一题有草稿时撤销先确认，取消保留草稿且不调用删除接口', async () => {
        await render(<ReviewSession initialSubjectId="" />); await grade(); await save(); await answer('下一题草稿');
        mocks.confirm.mockResolvedValueOnce(false); await click('撤销复习结果');
        expect(mocks.delete).not.toHaveBeenCalled();
        expect(active().querySelector<HTMLTextAreaElement>('textarea[id^="review-answer-"]')?.value).toBe('下一题草稿');
        await click('撤销复习结果'); expect(active().textContent).toContain('数学 · 第 1 题 / 共 2 题');
    });
    it('首次只展示题干，未作答前不加载解答或生成任何变式', async () => {
        await render(<OriginalReview id="a" onSaved={vi.fn()} />);
        expect(container.textContent).toContain('原题题干');
        for (const text of ['标准答案', '解析正文', '过去的错答', '再来一道类似的']) expect(container.textContent).not.toContain(text);
        expect(mocks.post).not.toHaveBeenCalled();
        expect(mocks.get.mock.calls.some(([url]) => url.startsWith('/api/practice/generate'))).toBe(false);
    });
    it('最后一题保存后在小结上仍可撤销', async () => {
        mocks.get.mockImplementationOnce(async () => ({ items: snapshot.slice(0, 1) }));
        await render(<ReviewSession initialSubjectId="" />); await grade(); await save();
        expect(container.textContent).toContain('这一组做完啦');
        await click('撤销复习结果'); expect(active().textContent).toContain('数学 · 第 1 题 / 共 1 题');
        expect(container.textContent).not.toContain('这一组做完啦');
    });
    it('撤销失败不倒退进度，可再次重试', async () => {
        await render(<ReviewSession initialSubjectId="" />); await grade(); await save();
        mocks.delete.mockRejectedValueOnce(new Error('离线'));
        await click('撤销复习结果'); expect(active().textContent).toContain('英语 · 第 2 题 / 共 2 题');
        expect(container.textContent).toContain('撤销失败'); expect(button('撤销复习结果').disabled).toBe(false);
        await click('撤销复习结果'); expect(active().textContent).toContain('数学 · 第 1 题 / 共 2 题');
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
        expect(active().querySelector<HTMLTextAreaElement>('textarea[id^="review-answer-"]')?.value).toBe('草稿');
        await click('关闭复习'); expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining('放弃本题作答'), { destructive: true });
        expect(mocks.push).toHaveBeenCalledWith('/review'); expect(sessionStorage.getItem('review-completed')).toBe('0');
    });
    it('加载失败可以重试，空快照只显示空状态而非小结', async () => {
        mocks.get.mockRejectedValueOnce(new Error('网络中断'));
        await render(<ReviewSession initialSubjectId="" />);
        expect(container.querySelector('[role="alert"]')).toBeTruthy(); expect(container.textContent).not.toContain('这一组做完啦');
        mocks.get.mockResolvedValueOnce({ items: [] }); await click('重试');
        expect(container.textContent).toContain('今天没有需要复习的错题'); expect(container.textContent).not.toContain('这一组做完啦');
    });
    it('提交后立即显示对照与确认，AI 在后台判题；返回后再突出建议按钮', async () => {
        let resolveGrade: (value: { correct: boolean; reason: string }) => void = () => {};
        mocks.post.mockReturnValueOnce(new Promise(resolve => { resolveGrade = resolve; }));
        await render(<OriginalReview id="a" onSaved={vi.fn()} />); await answer('不必等待'); await click('提交，看看对不对');
        expect(container.textContent).toContain('正在看你的答案…'); expect(container.textContent).toContain('标准答案');
        expect(container.textContent).toContain('不必等待'); expect(button('会了').disabled).toBe(false);
        expect(button('会了').classList.contains('bg-primary')).toBe(false);
        await act(async () => resolveGrade({ correct: true, reason: '答案正确' }));
        expect(container.textContent).toContain('做对了'); expect(container.textContent).not.toContain('正在看你的答案…');
        expect(button('会了，下一题').classList.contains('bg-primary')).toBe(true);
    });
    it('AI 判题未返回时也可直接确认保存，不带判题依据', async () => {
        const onSaved = vi.fn();
        mocks.post.mockReturnValueOnce(new Promise(() => {}));
        await render(<OriginalReview id="a" onSaved={onSaved} />); await answer('先确认'); await click('提交，看看对不对');
        mocks.post.mockResolvedValueOnce(record); await click('没做对');
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ result: 'wrong', userAnswer: '先确认', gradeReason: null }));
        expect(onSaved).toHaveBeenCalledWith(record);
    });
    it('自行保存后晚到的判错不改写记录，保存锁继续阻止二次提交', async () => {
        let resolveGrade: (value: { correct: boolean; reason: string }) => void = () => {};
        mocks.post.mockReturnValueOnce(new Promise(resolve => { resolveGrade = resolve; }));
        const onSaved = vi.fn();
        await render(<OriginalReview id="a" onSaved={onSaved} />);
        await answer('先自行确认'); await click('提交，看看对不对');
        mocks.post.mockResolvedValueOnce(record); await click('会了');
        await act(async () => resolveGrade({ correct: false, reason: '晚到的判题' }));
        expect(container.querySelector('h2')?.textContent).toBe('试卷原图');
        expect(container.querySelector('[data-stamp=almost]')).toBeTruthy();
        expect(container.querySelector('.lucide-x')).toBeNull();
        expect(button('明天再见').disabled).toBe(true);
        expect(button('我觉得我是对的').disabled).toBe(true);
        await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' })));
        expect(mocks.post.mock.calls.filter(([url]) => url === '/api/practice/record')).toHaveLength(1);
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ result: 'correct', confidence: 'sure', gradeReason: null }));
        expect(onSaved).toHaveBeenCalledTimes(1);
    });
    it('纯文字作答与标准答案一致时本地判对，不调用 AI 判题', async () => {
        await render(<OriginalReview id="a" onSaved={vi.fn()} />); await answer(' 标准答案。'); await click('提交，看看对不对');
        expect(container.textContent).toContain('做对了'); expect(container.textContent).not.toContain('正在看你的答案…');
        expect(button('会了，下一题').classList.contains('bg-primary')).toBe(true);
        expect(mocks.post).not.toHaveBeenCalled();
        mocks.post.mockResolvedValueOnce(record); await click('会了，下一题');
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ result: 'correct', confidence: 'sure', gradeReason: null }));
    });
    it('需要论证的题目即使结论一致也交给 AI', async () => {
        mocks.get.mockImplementation(async (url: string) => url === '/api/settings' ? {} : { ...item, questionText: '证明两底角相等' });
        mocks.post.mockResolvedValueOnce({ correct: true, reason: '论证完整' });
        await render(<OriginalReview id="a" onSaved={vi.fn()} />); await answer('标准答案'); await click('提交，看看对不对');
        expect(mocks.post).toHaveBeenCalledWith('/api/practice/grade', expect.objectContaining({ mode: 'original', userAnswer: '标准答案' }), expect.any(Object));
        expect(container.textContent).toContain('做对了');
    });
    it('AI 判题失败保留答案并允许手动确认，不自动写记录', async () => {
        mocks.post.mockRejectedValueOnce(new Error('超时'));
        await render(<OriginalReview id="a" onSaved={vi.fn()} />); await answer('保留答案'); await click('提交，看看对不对');
        expect(container.textContent).toContain('请自己对一对答案'); expect(container.textContent).toContain('保留答案');
        expect(container.textContent).toContain('标准答案'); expect(button('还不太熟').disabled).toBe(false);
        expect(button('没做对').disabled).toBe(false);
        expect(container.textContent).not.toContain('其实做错了');
        for (const label of ['没做对', '还不太熟', '会了']) {
            expect(button(label).classList.contains('bg-primary')).toBe(false);
            expect(button(label).classList.contains('hover:bg-accent')).toBe(false);
        }
        expect(mocks.post).toHaveBeenCalledTimes(1);
    });
    it('小结三格不借用跳过数，做对与判错分组，收工回今天', async () => {
        const outcomes: ReviewOutcome[] = [
            { id: 'a', result: 'correct', nextReviewAt: null, masteryBefore: 'reviewing', masteryAfter: 'mastered' },
            { id: 'b', result: 'wrong', nextReviewAt: null, masteryBefore: 'reviewing', masteryAfter: 'reviewing' },
            { id: 'c', result: 'skipped', nextReviewAt: null },
            { id: 'd', result: 'skipped', nextReviewAt: null },
        ];
        await render(<ReviewSummary items={outcomes} outcomes={outcomes} />);
        expect([...container.querySelectorAll('dl dd')].map(element => element.textContent)).toEqual(['1', '1', '1']);
        expect([...container.querySelectorAll('dl dt')].map(element => element.textContent)).toEqual(['这次做对', '明天再见', '彻底掌握']);
        expect([...container.querySelectorAll('ol a')].map(element => element.getAttribute('href'))).toEqual(['/error-items/a', '/error-items/b']);
        expect(container.textContent).toContain('跳过 2 题，仍需复习');
        expect(container.querySelector('[data-stamp="done"]')).toBeNull();
        const finish = container.querySelector<HTMLAnchorElement>('a[href="/"]')!;
        expect(finish.textContent).toBe('收工');
        await act(async () => finish.dispatchEvent(new MouseEvent('click', { bubbles: true })));
        expect(sessionStorage.getItem('review-completed')).toBe('2');
    });
    it.each([
        { mode: 'today' as const, date: '2026-11-10', result: 'correct' as const, cleared: true },
        { mode: 'today' as const, date: undefined, result: 'correct' as const, cleared: false },
        { mode: 'extra' as const, date: '2026-11-10', result: 'correct' as const, cleared: false },
        { mode: 'today' as const, date: '2026-11-10', result: 'skipped' as const, cleared: false },
    ])('小结标题与完成章按当天证据分支：$mode / $date / $result', async ({ mode, date, result, cleared }) => {
        const outcomes: ReviewOutcome[] = [{ id: 'a', nextReviewAt: null, result }];
        await render(<ReviewSummary items={outcomes} outcomes={outcomes} mode={mode} completionDate={date} />);
        expect(container.querySelector('h1')?.textContent).toBe(cleared ? '今天的错题清空啦' : '这一组做完啦');
        expect(!!container.querySelector('[data-stamp="done"]')).toBe(cleared);
        if (cleared) expect(container.querySelector('[data-stamp="done"]')?.getAttribute('aria-label')).toBe('2026-11-10 · 搞定');
        expect(container.textContent).not.toContain('连续');
        expect(container.textContent).not.toContain('新贴纸');
        if (result === 'correct') {
            expect([...container.querySelectorAll('dd')].map(element => element.textContent)).toEqual(['1', '0', '–']);
            expect(container.textContent).toContain('待确认');
        }
    });
    it('提交时冻结前台用时，随确认保存；判题等待和撤销后重存不重复计时', async () => {
        let milliseconds = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => milliseconds);
        await render(<OriginalReview id="a" onSaved={vi.fn()} />);
        milliseconds = 125000;
        await grade();
        milliseconds = 900000;
        await save();
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ source: 'review', durationSec: 125 }));
        vi.mocked(performance.now).mockRestore();
    });
    it('小结用时求和，额外一组重新获取队列并加载全新的作答页', async () => {
        const next = vi.fn();
        const outcomes: ReviewOutcome[] = [{ id: 'a', result: 'correct', nextReviewAt: null, durationSec: 61 }, { id: 'b', result: 'wrong', nextReviewAt: null, durationSec: 64 }];
        await render(<ReviewSummary items={outcomes} outcomes={outcomes} onExtra={next} />);
        expect(container.textContent).toContain('2 题 · 用了 3 分钟');
        await click('还想做？再来 5 题'); expect(next).toHaveBeenCalledTimes(1);
        await render(<ReviewSession initialSubjectId="math" />);
        await click('跳过'); await click('跳过');
        mocks.get.mockResolvedValueOnce({ items: [snapshot[0]] });
        await click('还想做？再来 5 题');
        expect(mocks.get).toHaveBeenCalledWith('/api/review/due?format=ids&mode=extra&subjectId=math');
        expect(active().textContent).toContain('数学 · 第 1 题 / 共 1 题');
        expect(button('提交，看看对不对').disabled).toBe(false);
    });

    it('同一张专注卡片切换作答与对照，题目三行摘要可展开，AI 摘要可见且详情折叠', async () => {
        await render(<ReviewSession initialSubjectId="" />);
        const card = active().querySelector('section > div')!;
        expect(card.querySelector('.review-prompt')).toBeTruthy();
        expect(card.querySelector('.review-response')).toBeTruthy();
        expect(card.querySelector('img[src="/test.png"]')).toBeNull();
        expect(mocks.get.mock.calls.some(([url]) => url.endsWith('/source'))).toBe(false);
        await grade();
        expect(mocks.get.mock.calls.filter(([url]) => url.endsWith('/source'))).toHaveLength(1);
        expect(active().querySelector('section > div')).toBe(card);
        expect(card.querySelector('dl')?.classList.contains('border')).toBe(false);
        expect([...card.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['你写的', '上次错答', '参考答案']);
        const summary = card.querySelector<HTMLButtonElement>('.review-prompt button[aria-expanded]')!;
        expect(summary.getAttribute('aria-expanded')).toBe('false');
        expect(card.querySelector('.review-prompt .line-clamp-3')).toBeTruthy();
        await act(async () => summary.click());
        expect(summary.getAttribute('aria-expanded')).toBe('true');
        expect(card.querySelectorAll('.review-prompt p').length).toBeGreaterThan(0);
        const reason = [...card.querySelectorAll('details')].find(node => node.querySelector('summary')?.textContent === '判题依据')!;
        expect(reason.open).toBe(false); expect(reason.querySelector('summary')?.textContent).not.toContain('答案正确');
        expect(card.querySelector('[data-paper=note]')?.textContent).toContain('答案正确');
        expect(card.querySelector('[data-stamp=correct]')).toBeTruthy();
        for (const title of ['详细解析', '再来一道类似的']) {
            const detail = [...card.querySelectorAll('details')].find(node => node.querySelector('summary')?.textContent === title)!;
            expect(detail).toBeTruthy(); expect(detail.open).toBe(false);
        }
    });
    it.each([
        { questionText: '如图，求面积', visible: true },
        { questionText: '请结合表中数据作答', visible: true },
        { questionText: '求面积', requiresImage: true, visible: true },
        { questionText: '如图', hasFigure: true, visible: true },
        { questionText: '观察下图', figureSvg: '<svg />', visible: false },
        { questionText: '观察下图', requiresImage: true, figureSvg: '<svg />', visible: false },
        { questionText: '观察下图', requiresImage: true, figurePreviewUrl: '/figure.png', visible: false },
        { questionText: '如图', originalImageUrl: '', visible: false },
        { questionText: '求面积', requiresImage: true, originalImageUrl: '', visible: false },
        { questionText: '不依赖图形的题', visible: false },
        { questionText: '', ocrText: '见图', visible: true },
    ])('作答前按需提供原图入口，默认不渲染原图：%j', async ({ visible, ...question }) => {
        mocks.get.mockImplementation(async (url: string) => url === '/api/settings' ? {} : { ...item, ...question });
        await render(<OriginalReview id="a" onSaved={vi.fn()} />);
        expect(container.querySelector('img[src="/test.png"]')).toBeNull();
        const peek = [...container.querySelectorAll('button')].find(node => node.textContent === '看原图');
        expect(!!peek).toBe(visible);
        expect(container.textContent?.includes('原图上可能有答案')).toBe(visible);
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(mocks.get.mock.calls.some(([url]) => url.endsWith('/source'))).toBe(visible);
        if (peek) {
            expect(peek.getAttribute('aria-expanded')).toBe('false');
            expect(peek.classList.contains('min-h-11')).toBe(true);
            expect(document.getElementById(peek.getAttribute('aria-describedby')!)?.textContent).toBe('原图上可能有答案');
        }
        if ('figurePreviewUrl' in question) expect(container.querySelector('img[src="/figure.png"]')).toBeTruthy();
    });
    it('作答时点击即可打开同一出处查看器，关闭保留答案，提交后仍显示原图卡', async () => {
        const source = { page: { id: 'page', imageUrl: '/paper.png', width: 1000, height: 1400,
            fileName: '数学试卷', pageNumber: 2, origin: 'image', createdAt: '2026-11-10T00:00:00Z' },
            regions: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.3, order: 0 }] };
        mocks.get.mockImplementation(async (url: string) => url === '/api/settings' ? {} : url.endsWith('/source') ? source : { ...item, questionText: '如图，求面积' });
        await render(<OriginalReview id="a" onSaved={vi.fn()} />);
        await answer('先写的答案');
        await click('看原图');
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
        expect(dialog).toBeTruthy();
        expect(dialog.querySelector('img')?.getAttribute('src')).toBe('/paper.png');
        expect(dialog.textContent).toContain('数学试卷');
        expect(dialog.querySelector('rect.stroke-blue-600')?.getAttribute('x')).toBe('0.1');
        expect(mocks.post).not.toHaveBeenCalled();
        await act(async () => dialog.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!.click());
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(active().querySelector<HTMLTextAreaElement>('textarea[id^="review-answer-"]')?.value).toBe('先写的答案');
        expect(button('看原图').getAttribute('aria-expanded')).toBe('false');
        await grade();
        expect(container.textContent).toContain('试卷原图');
        expect(container.textContent).not.toContain('原图上可能有答案');
        expect(container.querySelector('img[src="/paper.png"]')).toBeTruthy();
    });
    it.each(['/test.png', ''])('待核对题仅在提交后显示提示和定位链接，仍可正常确认：%s', async originalImageUrl => {
        mocks.get.mockImplementation(async (url: string) => url === '/api/settings' ? {} : { ...item, originalImageUrl, needsCheck: true });
        await render(<OriginalReview id="a" onSaved={vi.fn()} />);
        expect(container.textContent).not.toContain('这道题可能与原图不一致');
        expect(container.textContent).not.toContain('看一眼');
        expect(container.querySelector('a[href^="/checks"]')).toBeNull();
        expect(container.querySelector('img')).toBeNull();
        expect(mocks.get.mock.calls.some(([url]) => url.endsWith('/source'))).toBe(false);
        await grade();
        // 各视口共用同一张原图卡与核对入口。
        const sources = [...container.querySelectorAll<HTMLDetailsElement>('details')].filter(detail =>
            detail.querySelector('summary')?.textContent === '这道题可能与原图不一致 · 看原图');
        expect(sources).toHaveLength(1);
        for (const detail of sources) {
            expect(detail.open).toBe(false);
            expect(detail.querySelector('summary [aria-hidden="true"]')?.className).toContain('bg-yellow-500');
            await act(async () => detail.querySelector('summary')!.click());
            expect(detail.open).toBe(true);
            expect(detail.querySelector('a')?.textContent).toBe('看一眼');
            expect(detail.querySelector('a')?.getAttribute('href')).toBe('/checks?id=a');
            expect(container.querySelector('.review-prompt img[src="/test.png"]') !== null).toBe(!!originalImageUrl);
        }
        await save();
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ source: 'review', result: 'correct' }));
    });
    it.each([false, undefined])('无待核对问题时原图行保持原样：%s', async needsCheck => {
        mocks.get.mockImplementation(async (url: string) => url === '/api/settings' ? {} : { ...item, needsCheck });
        await render(<OriginalReview id="a" onSaved={vi.fn()} />); await grade();
        const sources = [...container.querySelectorAll('.review-prompt [data-paper="paper"]')].filter(card => card.querySelector('h2')?.textContent === '试卷原图');
        expect(sources).toHaveLength(1);
        expect(sources[0].querySelector('.student-paper-tape')).toBeTruthy();
        expect(sources[0].textContent).toContain('试卷原图');
        expect(sources[0].querySelector('img[src="/test.png"]')).toBeTruthy();
        expect(container.textContent).not.toContain('这道题可能与原图不一致');
        expect(container.querySelector('a[href^="/checks"]')).toBeNull();
    });
    it('提交快捷键遵守空答案校验；按 1/2/3 只保存当前可见题，输入框聚焦时不触发', async () => {
        await render(<ReviewSession initialSubjectId="" />);
        await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true })));
        expect(active().querySelector('[role="alert"]')?.textContent).toContain('请先填写答案');
        await answer('快捷作答'); mocks.post.mockResolvedValueOnce({ correct: true, reason: '完整' });
        await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true })));
        expect(active().textContent).toContain('做对了');
        const notes = document.createElement('textarea'); container.appendChild(notes); notes.focus();
        await act(async () => notes.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })));
        expect(mocks.post.mock.calls.filter(([url]) => url === '/api/practice/record')).toHaveLength(0);
        notes.remove();
        mocks.post.mockResolvedValueOnce(record);
        await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' })));
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ result: 'correct', confidence: 'unsure' }));
        expect(active().textContent).toContain('英语 · 第 2 题 / 共 2 题');
        const saved = mocks.post.mock.calls.length;
        await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' })));
        expect(mocks.post).toHaveBeenCalledTimes(saved);
    });
    it.each([['1', 'correct', 'unsure'], ['2', 'correct', 'sure']] as const)('快捷键 %s 保存对应结果且忽略组合键与重复按键', async (key, result, confidence) => {
        await render(<OriginalReview id="a" onSaved={vi.fn()} />); await grade();
        for (const extra of [{ ctrlKey: true }, { repeat: true }, { isComposing: true }]) {
            await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key, ...extra })));
        }
        expect(mocks.post).toHaveBeenCalledTimes(1);
        mocks.post.mockResolvedValueOnce({ ...record, result });
        await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key })));
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ result }));
        expect(mocks.post.mock.calls.at(-1)?.[1].confidence).toBe(confidence);
    });

});
