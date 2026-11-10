import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionNumbers } from '@/components/exam-attempt/question-numbers';
import { SubmitPanel } from '@/components/exam-attempt/submit-panel';
import { GradingProgress } from '@/components/exam-attempt/grading-progress';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useReviewTimer } from '@/lib/hooks/use-review-timer';
import { examAttempt, attemptAnswer } from '../fixtures/exam-attempt';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.setItem('app-language', 'zh');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const items = [{ id: 'q1', number: 1, answered: true, flagged: false }, { id: 'q2', number: 2, answered: false, flagged: true }];
const mount = async (node: ReactNode) => { await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>)); };
describe('在线作答题号与交卷', () => {
    it('实心、空心、小旗及当前题描边有独立语义，选择题号自动滚入视口', async () => {
        const select = vi.fn();
        const scroll = vi.fn();
        HTMLElement.prototype.scrollIntoView = scroll;
        await mount(<QuestionNumbers items={items} current={0} onSelect={select} />);
        expect(container.querySelector('[aria-current="step"]')?.textContent).toBe('1');
        expect(container.querySelector('[aria-label="第 1 题 · 已答"]')).not.toBeNull();
        expect(container.querySelector('[aria-label="第 2 题 · 等会再看"] svg')).not.toBeNull();
        expect(scroll).toHaveBeenCalled();
        await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="第 2 题 · 等会再看"]')!.click());
        expect(select).toHaveBeenCalledWith(1);
    });
    it('窄屏图例只在展开题号面板时显示，宽屏始终同排显示', async () => {
        await mount(<QuestionNumbers items={items} current={0} onSelect={vi.fn()} />);
        const legend = container.querySelector('nav p')!;
        expect(legend.classList.contains('hidden')).toBe(true);
        expect(legend.classList.contains('lg:flex')).toBe(true);
        const toggle = container.querySelector<HTMLButtonElement>('[aria-expanded]')!;
        await act(async () => toggle.click());
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(legend.classList.contains('hidden')).toBe(false);
        await act(async () => toggle.click());
        expect(legend.classList.contains('hidden')).toBe(true);
    });
    it('交卷面板显示未答和小旗，点题号返回该题，保存期间不允许交卷', async () => {
        const select = vi.fn(); const submit = vi.fn(); const open = vi.fn();
        await mount(<SubmitPanel items={items} open busy={false} onOpenChange={open} onSelect={select} onSubmit={submit} />);
        const dialog = document.querySelector('[role="dialog"]')!;
        expect(dialog.textContent).toContain('已答 1/2');
        const number = [...dialog.querySelectorAll('button')].find(button => button.textContent === '2')!;
        await act(async () => number.click());
        expect(select).toHaveBeenCalledWith(1); expect(open).toHaveBeenCalledWith(false);
        await mount(<SubmitPanel items={items} open busy onOpenChange={open} onSelect={select} onSubmit={submit} />);
        expect([...document.querySelectorAll('button')].find(button => button.textContent === '等待保存…')?.disabled).toBe(true);
        expect(submit).not.toHaveBeenCalled();
    });
    it('全部答完且无小旗仅显示完成句，不显示未答题号', async () => {
        await mount(<SubmitPanel items={items.map(item => ({ ...item, answered: true, flagged: false }))} open busy={false} onOpenChange={vi.fn()} onSelect={vi.fn()} onSubmit={vi.fn()} />);
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain('2 题都答完了');
        expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('没答');
        expect(document.querySelectorAll('[role="dialog"] p')).toHaveLength(1);
    });
    it('批改进度只点亮已判题，不显示对错与参考答案', async () => {
        const attempt = { ...examAttempt(), status: 'grading' as const, answers: [{ ...attemptAnswer('q1', 'wrong'), aiResult: 'wrong' as const }] };
        await mount(<GradingProgress attempt={attempt} error={false} onRetry={vi.fn()} />);
        expect(container.textContent).toContain('正在批改 1/3');
        expect(container.querySelectorAll('nav svg')).toHaveLength(1);
        expect(container.textContent).not.toContain('差一点');
        expect(container.textContent).toContain('可以先离开');
    });
    it('计时接续服务器累计值，后台暂停，前台继续', async () => {
        let now = 0; let hidden = false; let read = () => 0;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
        function Timer() { const timer = useReviewTimer(true, 12); read = timer.elapsed; return null; }
        await mount(<Timer />);
        now = 4000; expect(read()).toBe(16);
        hidden = true; document.dispatchEvent(new Event('visibilitychange'));
        now = 20000; expect(read()).toBe(16);
        hidden = false; document.dispatchEvent(new Event('visibilitychange'));
        now = 23000; expect(read()).toBe(19);
    });
});
