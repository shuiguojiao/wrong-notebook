import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedQueue } from '@/lib/question/debounced-queue';
afterEach(() => vi.useRealTimers());
describe('图文核对去抖队列', () => {
    it('同题多次修改合并，不同题互不干扰', async () => {
        vi.useFakeTimers();
        const run = vi.fn(async () => {});
        const queue = createDebouncedQueue(run, vi.fn(), 100);
        queue.enqueue('a');
        await vi.advanceTimersByTimeAsync(80);
        queue.enqueue('a'); queue.enqueue('b');
        await vi.advanceTimersByTimeAsync(99);
        expect(run).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(run.mock.calls).toEqual([['a'], ['b']]);
    });
    it('运行时的修改在当前任务结束后只再检查一次', async () => {
        vi.useFakeTimers();
        let finish!: () => void;
        const run = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
        const queue = createDebouncedQueue(run, vi.fn(), 100);
        queue.enqueue('a'); await vi.advanceTimersByTimeAsync(100);
        queue.enqueue('a'); queue.enqueue('a'); await vi.advanceTimersByTimeAsync(100);
        expect(run).toHaveBeenCalledTimes(1);
        finish(); await vi.advanceTimersByTimeAsync(100);
        expect(run).toHaveBeenCalledTimes(2);
        finish(); queue.clear();
    });
    it('失败由后台处理，结束后仍可重试；clear 撤下未开始的任务', async () => {
        vi.useFakeTimers();
        const onError = vi.fn();
        const run = vi.fn().mockRejectedValueOnce(new Error('失败')).mockResolvedValue(undefined);
        const queue = createDebouncedQueue(run, onError, 100);
        queue.enqueue('a'); await vi.advanceTimersByTimeAsync(100);
        expect(onError).toHaveBeenCalledWith('a', expect.any(Error));
        queue.enqueue('a'); await vi.advanceTimersByTimeAsync(100);
        expect(run).toHaveBeenCalledTimes(2);
        queue.enqueue('b'); queue.clear(); await vi.advanceTimersByTimeAsync(100);
        expect(run).toHaveBeenCalledTimes(2);
    });
});
