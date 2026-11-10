import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExamAnswering } from '@/lib/hooks/use-exam-answering';
import { initialExamDraft } from '@/lib/exam/exam-answering-draft';
import type { StoredExamDraft } from '@/lib/exam/exam-answering-draft';
import { prepareAnswerImages } from '@/lib/handwriting/prepare-answer';
import { apiClient } from '@/lib/api-client';
import { examAttempt } from '../fixtures/exam-attempt';

const local = vi.hoisted(() => new Map<string, StoredExamDraft>());
vi.mock('@/lib/exam/exam-answering-draft', async original => ({
    ...(await original<typeof import('@/lib/exam/exam-answering-draft')>()),
    examDraftStorage: vi.fn(async (key: string, write?: { value: StoredExamDraft | null }) => {
        if (write) { if (write.value) local.set(key, structuredClone(write.value)); else local.delete(key); return undefined; }
        return structuredClone(local.get(key));
    }),
}));
vi.mock('@/lib/handwriting/prepare-answer', () => ({ prepareAnswerImages: vi.fn(async () => ({ images: [], displayImage: undefined })) }));
vi.mock('@/lib/api-client', () => ({ apiClient: { put: vi.fn(), post: vi.fn() } }));

let root: Root;
let container: HTMLDivElement;
let latest: ReturnType<typeof useExamAnswering>;
const submitted = vi.fn(async () => undefined);
const attempt = { ...examAttempt(), kind: 'online' as const, status: 'answering' as const, durationSec: 15 };
function Probe() { const value = useExamAnswering(attempt, submitted); useEffect(() => { latest = value; }); return null; }
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers(); local.clear(); vi.clearAllMocks();
    vi.mocked(apiClient.put).mockResolvedValue({}); vi.mocked(apiClient.post).mockResolvedValue({});
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount() { await act(async () => root.render(<Probe />)); }

describe('在线作答草稿与交卷协调', () => {
    it('多图超限指出具体题目且保留本机草稿，修正后再上传', async () => {
        await mount();
        vi.mocked(prepareAnswerImages).mockRejectedValueOnce(new Error('TOO_MANY_ANSWER_IMAGES'));
        await act(async () => latest.update('q1', { ...latest.drafts.q1, text: '不能丢的答案' }));
        await act(async () => latest.flush());
        expect(latest.imageError).toEqual({ questionId: 'q1', key: 'tooManyImages' });
        expect(local.get('attempt:q1')?.draft.text).toBe('不能丢的答案');
        expect(apiClient.put).not.toHaveBeenCalled();
        await act(async () => latest.flush());
        expect(latest.imageError).toBeNull();
        expect(apiClient.put).toHaveBeenCalledOnce();
    });
    it('恢复本机笔迹、照片和累计用时，脏草稿自动补传，切题后内容仍在', async () => {
        const draft = { ...initialExamDraft(), text: '继续写', ink: { strokes: [{ points: [[1, 2, .5] as [number, number, number]], size: 4, color: '#111827', pen: true }], past: [], future: [] }, photos: ['photo'], mode: 'handwriting' as const };
        local.set('attempt:q1', { draft, dirty: true, durationSec: 42 });
        await mount();
        expect(latest.ready).toBe(true);
        expect(latest.drafts.q1).toEqual(draft);
        expect(apiClient.put).toHaveBeenCalledWith(expect.stringContaining('/q1'), expect.objectContaining({ answerText: '继续写', durationSec: 42 }));
        await act(async () => latest.navigate(1));
        expect(latest.current).toBe(1);
        expect(latest.drafts.q1.ink.strokes).toHaveLength(1);
        expect(latest.visited.has(0)).toBe(true);
    });
    it('键盘左右切题但不抢输入框里的方向键', async () => {
        await mount();
        const field = document.createElement('textarea'); container.appendChild(field);
        await act(async () => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
        expect(latest.current).toBe(0);
        await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
        expect(latest.current).toBe(1);
    });
    it('交卷等待所有保存，成功后才清理本机草稿', async () => {
        await mount();
        let release!: () => void;
        vi.mocked(apiClient.put).mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({}); }));
        await act(async () => latest.update('q1', { ...latest.drafts.q1, text: '我的答案' }));
        let sending!: Promise<void>;
        await act(async () => { sending = latest.submit(); });
        expect(apiClient.post).not.toHaveBeenCalled();
        expect(local.get('attempt:q1')?.draft.text).toBe('我的答案');
        await act(async () => { release(); await sending; });
        expect(apiClient.post).toHaveBeenCalledWith('/api/exams/paper-1/attempts/attempt/submit', expect.objectContaining({ durationSec: expect.any(Number) }));
        expect(local.size).toBe(0); expect(submitted).toHaveBeenCalledOnce();
    });
    it('保存失败不能交卷，离线退出只在本机草稿完整落盘后允许', async () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        await mount();
        await act(async () => latest.update('q1', { ...latest.drafts.q1, text: '离线答案' }));
        await act(async () => latest.submit());
        expect(apiClient.post).not.toHaveBeenCalled();
        expect(latest.status).toBe('retrying');
        let safe = false;
        await act(async () => { safe = await latest.saveForExit(); });
        expect(safe).toBe(true); expect(local.get('attempt:q1')?.dirty).toBe(true);
    });
    it('前后台切换立即保存，隐藏计时偏好只存本机', async () => {
        let hidden = false;
        vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
        await mount();
        await act(async () => latest.toggleTimer());
        expect(localStorage.getItem('exam-timer-hidden')).toBe('true');
        await act(async () => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
        expect(apiClient.put).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ durationSec: expect.any(Number) }));
        localStorage.removeItem('exam-timer-hidden');
    });
});
