import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeFeedback } from '@/components/practice/practice-feedback';
import { PracticeSession } from '@/components/practice/practice-session';
import { ReviewGraded } from '@/components/review/review-graded';
import { OriginalReview } from '@/components/review/original-review';
import { PracticeResultCard } from '@/components/practice-result-card';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useOriginalReview } from '@/lib/hooks/use-original-review';
import { usePracticeSession } from '@/lib/hooks/use-practice-session';
import { ANSWER_IMAGE } from '../fixtures/handwriting';
import type { InkHistory } from '@/lib/handwriting/strokes';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), exportInk: vi.fn(), compose: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get, post: mocks.post }, ApiError: class extends Error {} }));
vi.mock('@/lib/handwriting/compose', () => ({ composeAnswerImages: mocks.compose }));
vi.mock('@/lib/handwriting/render', () => ({ exportInk: mocks.exportInk, drawPaper: vi.fn(), drawStrokes: vi.fn() }));
vi.mock('@/lib/hooks/use-running-task', () => ({ useRunningTask: () => ({ running: false, refresh: mocks.refresh }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn() }) }));
const generated = { practiceVersion: 'a'.repeat(64), questionText: '1+1=?', answerText: '2', analysis: '加法', difficulty: 'medium', generatedAt: '2026-11-08T00:00:00Z' };
const ink: InkHistory = { strokes: [{ points: [[100, 100, 0.5]], color: '#111827', size: 4, pen: true }], past: [[]], future: [] };
let original: ReturnType<typeof useOriginalReview>;
let practice: ReturnType<typeof usePracticeSession>;
let root: Root;
let container: HTMLDivElement;
function Probe() {
    const o = useOriginalReview('item-1'); const p = usePracticeSession('item-1');
    useEffect(() => { original = o; practice = p; }); return null;
}
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.setItem('language', 'zh');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    mocks.get.mockImplementation(async (url: string) => url === '/api/settings' ? {} : url.startsWith('/api/practice/generate') ? { practice: generated } : { id: 'item-1', ...generated });
    mocks.exportInk.mockResolvedValue(ANSWER_IMAGE);
    mocks.compose.mockImplementation(async (images: string[]) => images[0]);
    mocks.post.mockResolvedValue({ correct: false, reason: '第二步有误', recognizedAnswer: 'x=3' });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function renderProbe() { await act(async () => root.render(<LanguageProvider><Probe /></LanguageProvider>)); }
async function click(text: string) {
    const button = [...container.querySelectorAll('button')].find(node => node.textContent?.startsWith(text));
    expect(button).toBeTruthy(); await act(async () => button!.click());
}

describe('两类作答会话的手写提交', () => {
    it('原题允许只交笔迹，识别结果单独保存且提交后锁定', async () => {
        await renderProbe(); await act(async () => original.setInk(ink));
        await act(async () => original.submit());
        expect(mocks.post).toHaveBeenCalledWith('/api/practice/grade', expect.objectContaining({ mode: 'original', userAnswer: '', answerImages: [ANSWER_IMAGE] }), expect.any(Object));
        expect(original.answerImages).toEqual([ANSWER_IMAGE]);
        expect(original.submitted).toBe(true); expect(original.answerImage).toBe(ANSWER_IMAGE);
        expect(original.recognizedAnswer).toBe('x=3'); expect(original.userAnswer).toBe('');
        await act(async () => original.submit()); expect(mocks.post).toHaveBeenCalledTimes(1);
    });
    it.each(['original', 'practice'] as const)('%s 撤回保留草稿，中止请求并忽略迟到结果，重提可正常判题', async mode => {
        let finish!: (result: { correct: boolean; reason: string; recognizedAnswer: string }) => void;
        mocks.post.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        await renderProbe();
        const current = () => mode === 'original' ? original : practice;
        await act(async () => { current().setInk(ink); current().setUserAnswer('补充'); current().setNotes('思路'); });
        let pending!: Promise<void>;
        await act(async () => { pending = mode === 'original' ? original.submit() : practice.submitAnswer(); });
        expect(current().canUndoSubmit).toBe(true);
        if (mode === 'practice') expect(practice.showAnswer).toBe(true);
        const signal = mocks.post.mock.calls[0][2].signal as AbortSignal;
        await act(async () => current().undoSubmit());
        expect(signal.aborted).toBe(true);
        expect(current().grading).toBe(false);
        expect(current().ink).toEqual(ink); expect(current().userAnswer).toBe('补充'); expect(current().notes).toBe('思路');
        expect(mode === 'original' ? original.submitted : practice.isSubmitted).toBe(false);
        await act(async () => { finish({ correct: true, reason: '迟到', recognizedAnswer: '旧识别' }); await pending; });
        expect(mode === 'original' ? original.graded : practice.isCorrect).toBeNull();
        expect(current().recognizedAnswer).toBeUndefined();
        expect(mocks.post.mock.calls.every(call => call[0] === '/api/practice/grade')).toBe(true);
        await act(async () => mode === 'original' ? original.submit() : practice.submitAnswer());
        expect(current().recognizedAnswer).toBe('x=3');
    });
    it.each(['original', 'practice'] as const)('%s 本地判对同样可撤回，三秒到期后不可撤回', async mode => {
        vi.useFakeTimers(); mocks.exportInk.mockResolvedValue(undefined);
        await renderProbe();
        const current = () => mode === 'original' ? original : practice;
        await act(async () => current().setUserAnswer('2'));
        await act(async () => mode === 'original' ? original.submit() : practice.submitAnswer());
        expect(current().canUndoSubmit).toBe(true);
        await act(async () => current().undoSubmit());
        expect(mode === 'original' ? original.graded : practice.isCorrect).toBeNull();
        await act(async () => mode === 'original' ? original.submit() : practice.submitAnswer());
        await act(async () => vi.advanceTimersByTime(3000));
        expect(current().canUndoSubmit).toBe(false);
        await act(async () => current().undoSubmit());
        expect(mode === 'original' ? original.submitted : practice.isSubmitted).toBe(true);
        expect(mocks.post).not.toHaveBeenCalled();
    });
    it('原题撤回恢复累计计时，排除对照阶段的时间', async () => {
        let now = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        await renderProbe();
        await act(async () => original.setInk(ink));
        now = 10000;
        await act(async () => original.submit());
        expect(original.durationSec).toBe(10);
        now = 12000;
        await act(async () => original.undoSubmit());
        now = 17000;
        await act(async () => original.submit());
        expect(original.durationSec).toBe(15);
    });
    it('复习导出等待期间锁住重复交卷，旋转后仍只将原始笔迹交给导出器', async () => {
        let finish!: (image: string) => void;
        mocks.exportInk.mockReturnValueOnce(new Promise<string>(resolve => { finish = resolve; }));
        await renderProbe();
        await act(async () => original.setInk(ink));
        await act(async () => { void original.submit(); void original.submit(); });
        expect(original.exporting).toBe(true);
        expect(mocks.exportInk).toHaveBeenCalledTimes(1);
        expect(mocks.exportInk).toHaveBeenCalledWith(ink.strokes);
        expect(mocks.post).not.toHaveBeenCalled();
        await act(async () => {
            window.dispatchEvent(new Event('orientationchange'));
            finish(ANSWER_IMAGE);
        });
        expect(original.submitted).toBe(true);
        expect(original.ink).toEqual(ink);
        expect(mocks.post).toHaveBeenCalledTimes(1);
        expect(mocks.post).toHaveBeenCalledWith('/api/practice/grade', expect.objectContaining({ answerImages: [ANSWER_IMAGE] }), expect.any(Object));
    });
    it('举一反三文字匹配也不能跳过手写图片判题', async () => {
        await renderProbe(); await act(async () => { practice.setInk(ink); practice.setUserAnswer('2'); });
        await act(async () => practice.submitAnswer());
        expect(mocks.post).toHaveBeenCalledWith('/api/practice/grade', expect.objectContaining({ userAnswer: '2', answerImages: [ANSWER_IMAGE], practiceVersion: generated.practiceVersion }), expect.any(Object));
        expect(practice.isCorrect).toBe(false); expect(practice.recognizedAnswer).toBe('x=3'); expect(practice.userAnswer).toBe('2');
    });
    it('举一反三仅有笔迹仍可提交', async () => {
        await renderProbe(); await act(async () => practice.setInk(ink));
        await act(async () => practice.submitAnswer());
        expect(mocks.post).toHaveBeenCalledWith('/api/practice/grade', expect.objectContaining({ userAnswer: '', answerImages: [ANSWER_IMAGE] }), expect.any(Object));
        expect(practice.isSubmitted).toBe(true);
    });
    it('导出失败保留两处草稿，不锁定、不调用 AI', async () => {
        mocks.exportInk.mockRejectedValue(new Error('IMAGE_EXPORT_FAILED'));
        await renderProbe(); await act(async () => { original.setInk(ink); practice.setInk(ink); });
        await act(async () => { await original.submit(); await practice.submitAnswer(); });
        expect(mocks.post).not.toHaveBeenCalled();
        expect(original.ink).toEqual(ink); expect(practice.ink).toEqual(ink);
        expect(original.submitted).toBe(false); expect(practice.isSubmitted).toBe(false);
        expect(original.exportError).toContain('笔迹已保留'); expect(practice.exportError).toContain('笔迹已保留');
    });
    it('看不清时两类会话保留原因并进入三选自评', async () => {
        mocks.post.mockResolvedValue({ correct: null, unreadable: true, reason: '看不清，请确认' });
        await renderProbe();
        await act(async () => { original.setInk(ink); practice.setInk(ink); });
        await act(async () => { await original.submit(); await practice.submitAnswer(); });
        expect(practice.suggestedResult).toBeNull();
        expect(practice.gradeReason).toBe('看不清，请确认');
        expect(original.graded).toMatchObject({ correct: null, unreadable: true });
        await act(async () => root.render(<LanguageProvider><ReviewGraded id="item-1" session={original}
            active revision={0} disabled={false} onSaved={vi.fn()} onBusyChange={vi.fn()} /></LanguageProvider>));
        expect(container.querySelector('[role="status"]')?.textContent).toContain('请自己对一对答案');
        expect(container.textContent).toContain('看不清，请确认');
        expect(container.textContent).toContain('没做对');
        expect(container.textContent).toContain('还不太熟');
        expect(container.textContent).toContain('会了');
        expect(container.textContent).not.toContain('明天再见');
        await act(async () => root.render(<LanguageProvider><PracticeFeedback isSubmitted grading={false}
            isCorrect={practice.isCorrect} gradeFailed={practice.gradeFailed} gradeReason={practice.gradeReason}
            notes="" canSubmit onSubmit={vi.fn()} onReveal={vi.fn()} /></LanguageProvider>));
        expect(container.querySelector('[role="status"]')?.textContent).toContain('看不清，请确认');
    });
    it('AI 失败仍保留图片，支持用户手动判定后存档', async () => {
        mocks.post.mockRejectedValue(new Error('AI_TIMEOUT_ERROR'));
        await renderProbe(); await act(async () => original.setInk(ink)); await act(async () => original.submit());
        expect(original.gradeFailed).toBe(true); expect(original.answerImage).toBe(ANSWER_IMAGE); expect(original.ink).toEqual(ink);
    });
    it('重新生成失败保留草稿，成功才清空笔迹与识别结果', async () => {
        await renderProbe(); await act(async () => { practice.setInk(ink); practice.setUserAnswer('草稿'); });
        mocks.post.mockRejectedValueOnce(new Error('AI_TIMEOUT_ERROR'));
        await act(async () => practice.generateQuestion());
        expect(practice.ink).toEqual(ink); expect(practice.userAnswer).toBe('草稿');
        mocks.post.mockResolvedValueOnce(generated);
        await act(async () => practice.generateQuestion());
        expect(practice.answerImages).toEqual([]); expect(practice.ink.strokes).toEqual([]); expect(practice.answerImage).toBeUndefined(); expect(practice.recognizedAnswer).toBeUndefined();
    });
    it.each(['original', 'practice'])('%s 实际作答区可切换到画布', async mode => {
        await act(async () => root.render(<LanguageProvider>{mode === 'original'
            ? <OriginalReview id="item-1" onSaved={vi.fn()} onStateChange={vi.fn()} />
            : <PracticeSession errorItemId="item-1" embedded />}</LanguageProvider>));
        const top = container.querySelector('.answer-submit-top')!;
        expect(top.className).toContain('md:block');
        expect(top.closest('.answer-input-heading')).toBeTruthy();
        expect(top.querySelector('button')?.className).toContain('min-h-11');
        expect(top.querySelector('button')?.className).not.toContain('w-full');
        await click('手写'); expect(container.querySelector('canvas')).toBeTruthy();
        expect(container.querySelector<HTMLSelectElement>('[aria-label="纸张背景"]')?.value).toBe(mode === 'original' ? 'lines' : 'blank');
        await click(mode === 'original' ? '打字' : '键盘'); expect(container.querySelector('textarea')).toBeTruthy();
    });
    it.each(['original', 'practice'] as const)('%s 界面提交后显示独立撤回按钮，点击恢复原文字且不写记录', async mode => {
        mocks.post.mockReturnValue(new Promise(() => {}));
        await act(async () => root.render(<LanguageProvider>{mode === 'original'
            ? <OriginalReview id="item-1" onSaved={vi.fn()} />
            : <PracticeSession errorItemId="item-1" embedded />}</LanguageProvider>));
        const field = container.querySelector<HTMLTextAreaElement>('textarea')!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, '保留作答');
            field.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await click(mode === 'original' ? '交卷，看看对不对' : '提交答案');
        expect(container.querySelector('.submit-undo-notice')?.textContent).toBe('撤回，继续写');
        expect(container.querySelector('.review-undo-notice')).toBeNull();
        await click('撤回，继续写');
        expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('保留作答');
        expect(container.querySelector('.submit-undo-notice')).toBeNull();
        expect(mocks.post.mock.calls.every(call => call[0] === '/api/practice/grade')).toBe(true);
        if (mode === 'practice') {
            expect(container.querySelector('.practice-submit-mobile')?.className).toContain('bottom-[var(--student-nav-height,0px)]');
        }
    });
    it('判题使用原图，展示与确认保存复用拼接图', async () => {
        const displayImage = `data:image/jpeg;base64,${btoa('\xff\xd8\xffdisplay')}`;
        mocks.compose.mockResolvedValueOnce(displayImage);
        await renderProbe();
        await act(async () => original.setInk(ink));
        await act(async () => original.submit());
        expect(mocks.compose).toHaveBeenCalledWith([ANSWER_IMAGE]);
        expect(original.answerImages).toEqual([ANSWER_IMAGE]);
        expect(original.answerImage).toBe(displayImage);
        expect(mocks.post).toHaveBeenCalledWith('/api/practice/grade', expect.objectContaining({ answerImages: [ANSWER_IMAGE] }), expect.any(Object));
        await act(async () => root.render(<LanguageProvider><ReviewGraded id="item-1" session={original}
            active revision={0} disabled={false} onSaved={vi.fn()} onBusyChange={vi.fn()} /></LanguageProvider>));
        expect(container.querySelector('[data-kind="mine"] img')?.getAttribute('src')).toBe(displayImage);
        mocks.post.mockResolvedValueOnce({ id: 'record-1' });
        await click('明天再见');
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({ answerImage: displayImage }));
    });
    it('确认结果时将图片、识别文本和键盘内容一起提交 record', async () => {
        mocks.post.mockResolvedValue({ id: 'record-1' });
        await act(async () => root.render(<LanguageProvider><PracticeResultCard errorItemId="item-1" source="review" suggested="wrong"
            question={generated} difficulty="" userAnswer="补充文字" notes="" gradeReason="第二步有误" answerImage={ANSWER_IMAGE} recognizedAnswer="x=3" /></LanguageProvider>));
        await click('明天再见');
        expect(mocks.post).toHaveBeenCalledWith('/api/practice/record', expect.objectContaining({ source: 'review', userAnswer: '补充文字', answerImage: ANSWER_IMAGE, recognizedAnswer: 'x=3' }));
    });
    it('复习对照保留手写缩略图，识别文本默认折叠且不替换用户原答案', async () => {
        await renderProbe();
        await act(async () => { original.setInk(ink); original.setUserAnswer('补充文字'); });
        await act(async () => original.submit());
        await act(async () => root.render(<LanguageProvider><ReviewGraded id="item-1" session={original}
            active revision={0} disabled={false} onSaved={vi.fn()} onBusyChange={vi.fn()} /></LanguageProvider>));
        const mine = container.querySelector('[data-kind="mine"]')!;
        expect(mine.textContent).toContain('补充文字');
        expect(mine.textContent).not.toContain('x=3');
        expect(mine.querySelector('img')?.getAttribute('src')).toBe(ANSWER_IMAGE);
        const recognized = [...container.querySelectorAll('details')].find(node => node.textContent?.includes('x=3'))!;
        expect(recognized.open).toBe(false);
        expect(recognized.querySelector('summary')?.textContent).toBe('手写识别结果（AI）');
    });

});
