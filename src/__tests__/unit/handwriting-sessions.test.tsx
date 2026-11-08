import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeSession } from '@/components/practice/practice-session';
import { OriginalReview } from '@/components/review/original-review';
import { PracticeResultCard } from '@/components/practice-result-card';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useOriginalReview } from '@/lib/hooks/use-original-review';
import { usePracticeSession } from '@/lib/hooks/use-practice-session';
import { ANSWER_IMAGE } from '../fixtures/handwriting';
import type { InkHistory } from '@/lib/handwriting/strokes';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), exportInk: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get, post: mocks.post }, ApiError: class extends Error {} }));
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
    mocks.post.mockResolvedValue({ correct: false, reason: '第二步有误', recognizedAnswer: 'x=3' });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function renderProbe() { await act(async () => root.render(<LanguageProvider><Probe /></LanguageProvider>)); }
async function click(text: string) {
    const button = [...container.querySelectorAll('button')].find(node => node.textContent?.startsWith(text));
    expect(button).toBeTruthy(); await act(async () => button!.click());
}

describe('两类作答会话的手写提交', () => {
    it('原题允许只交笔迹，识别结果单独保存且提交后锁定', async () => {
        await renderProbe(); await act(async () => original.setInk(ink));
        await act(async () => original.submit());
        expect(mocks.post).toHaveBeenCalledWith('/api/practice/grade', expect.objectContaining({ mode: 'original', userAnswer: '', answerImage: ANSWER_IMAGE }), expect.any(Object));
        expect(original.submitted).toBe(true); expect(original.answerImage).toBe(ANSWER_IMAGE);
        expect(original.recognizedAnswer).toBe('x=3'); expect(original.userAnswer).toBe('');
        await act(async () => original.submit()); expect(mocks.post).toHaveBeenCalledTimes(1);
    });
    it('举一反三文字匹配也不能跳过手写图片判题', async () => {
        await renderProbe(); await act(async () => { practice.setInk(ink); practice.setUserAnswer('2'); });
        await act(async () => practice.submitAnswer());
        expect(mocks.post).toHaveBeenCalledWith('/api/practice/grade', expect.objectContaining({ userAnswer: '2', answerImage: ANSWER_IMAGE, practiceVersion: generated.practiceVersion }), expect.any(Object));
        expect(practice.isCorrect).toBe(false); expect(practice.recognizedAnswer).toBe('x=3'); expect(practice.userAnswer).toBe('2');
    });
    it('举一反三仅有笔迹仍可提交', async () => {
        await renderProbe(); await act(async () => practice.setInk(ink));
        await act(async () => practice.submitAnswer());
        expect(mocks.post).toHaveBeenCalledWith('/api/practice/grade', expect.objectContaining({ userAnswer: '', answerImage: ANSWER_IMAGE }), expect.any(Object));
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
        expect(practice.ink.strokes).toEqual([]); expect(practice.answerImage).toBeUndefined(); expect(practice.recognizedAnswer).toBeUndefined();
    });
    it.each(['original', 'practice'])('%s 实际作答区可切换到画布', async mode => {
        await act(async () => root.render(<LanguageProvider>{mode === 'original'
            ? <OriginalReview id="item-1" onSaved={vi.fn()} onStateChange={vi.fn()} />
            : <PracticeSession errorItemId="item-1" embedded />}</LanguageProvider>));
        await click('手写'); expect(container.querySelector('canvas')).toBeTruthy();
        await click('键盘'); expect(container.querySelector('textarea')).toBeTruthy();
    });
    it('确认结果时将图片、识别文本和键盘内容一起提交 record', async () => {
        mocks.post.mockResolvedValue({ id: 'record-1' });
        await act(async () => root.render(<LanguageProvider><PracticeResultCard errorItemId="item-1" source="review" suggested="wrong"
            question={generated} difficulty="" userAnswer="补充文字" notes="" gradeReason="第二步有误" answerImage={ANSWER_IMAGE} recognizedAnswer="x=3" /></LanguageProvider>));
        await click('做错了');
        expect(mocks.post).toHaveBeenCalledWith('/api/practice/record', expect.objectContaining({ source: 'review', userAnswer: '补充文字', answerImage: ANSWER_IMAGE, recognizedAnswer: 'x=3' }));
    });
});
