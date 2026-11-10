import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamAutosave } from '@/lib/exam/exam-autosave';
import { initialExamDraft } from '@/lib/exam/exam-answering-draft';

describe('整卷自动保存', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    function setup() {
        const persist = vi.fn().mockResolvedValue(undefined);
        const send = vi.fn().mockResolvedValue(undefined);
        const online = vi.fn(() => true);
        const queue = new ExamAutosave({ persist, send, online, duration: () => 42, notify: vi.fn() });
        return { queue, persist, send, online };
    }
    it('停两秒后保存，在发送前写本机草稿，带累计用时', async () => {
        const { queue, persist, send } = setup();
        const draft = { ...initialExamDraft(), text: 'x' };
        queue.update('q1', draft);
        await vi.advanceTimersByTimeAsync(1999);
        expect(send).not.toHaveBeenCalled();
        expect(persist).toHaveBeenCalledWith('q1', { draft, dirty: true, durationSec: 42 });
        await vi.advanceTimersByTimeAsync(1);
        expect(send).toHaveBeenCalledWith('q1', draft, 42);
        expect(queue.status).toBe('saved');
        expect(persist).toHaveBeenLastCalledWith('q1', { draft, dirty: false, durationSec: 42 });
        queue.dispose();
    });
    it('网络失败指数退避，离线保留草稿，恢复后补传所有题', async () => {
        const { queue, persist, send, online } = setup();
        online.mockReturnValue(false);
        queue.update('q1', { ...initialExamDraft(), text: '1' });
        queue.update('q2', { ...initialExamDraft(), text: '2' });
        expect(await queue.flush()).toBe(false);
        expect(queue.status).toBe('retrying');
        expect(persist).toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
        online.mockReturnValue(true);
        send.mockRejectedValueOnce(new Error('offline'));
        await vi.advanceTimersByTimeAsync(2000);
        expect(send).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(3999);
        expect(send).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(send).toHaveBeenCalledTimes(3);
        expect(queue.pending).toBe(false);
        queue.dispose();
    });
    it('保存中更新笔迹不丢失；并发 flush 共用串行队列', async () => {
        const { queue, send } = setup();
        let release!: () => void;
        send.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
        queue.update('q1', { ...initialExamDraft(), text: '旧' });
        const saving = queue.flush();
        expect(queue.flush()).toBe(saving);
        await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
        queue.update('q1', { ...initialExamDraft(), text: '新' });
        release();
        expect(await saving).toBe(true);
        expect(send).toHaveBeenCalledTimes(2);
        expect(send).toHaveBeenLastCalledWith('q1', expect.objectContaining({ text: '新' }), 42);
        queue.dispose();
    });
    it('本机写盘失败不能宣称已保存，重试仍保留待保存版本', async () => {
        const { queue, persist, send } = setup();
        persist.mockRejectedValue(new Error('quota'));
        queue.update('q1', initialExamDraft());
        expect(await queue.flush()).toBe(false);
        expect(queue.pending).toBe(true);
        expect(send).not.toHaveBeenCalled();
        persist.mockResolvedValue(undefined);
        expect(await queue.flush()).toBe(true);
        queue.dispose();
    });
    it('重新进入时恢复离线草稿，主动 flush 立即补传', async () => {
        const { queue, send } = setup();
        queue.restore('q1', { ...initialExamDraft(), photos: ['本地照片'] }, true);
        expect(await queue.flush()).toBe(true);
        expect(send).toHaveBeenCalledWith('q1', expect.objectContaining({ photos: ['本地照片'] }), 42);
        queue.dispose();
    });
});
