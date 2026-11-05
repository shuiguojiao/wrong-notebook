import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { UploadQueueOptions } from "@/lib/import/upload-queue";
import { UploadQueue } from "@/lib/import/upload-queue";
import { createUploadQueueStore } from "@/lib/import/upload-queue-store";
import type { QueuedUpload } from "@/lib/import/upload-queue-store";
import type { ImportTaskDetail } from "@/lib/import/import-task-types";

const input = { imageBase64: "data:image/jpeg;base64,photo", language: "zh" as const };
const task = { id: "task" } as ImportTaskDetail;

function setup() {
    const records = new Map<string, QueuedUpload>();
    const store = {
        list: vi.fn(async (userId: string) => [...records.values()].filter(item => item.userId === userId)),
        put: vi.fn(async (item: QueuedUpload) => { records.set(item.id, structuredClone(item)); }),
        remove: vi.fn(async (id: string) => { records.delete(id); }),
        clear: vi.fn(async () => { records.clear(); }),
    };
    const send = vi.fn<UploadQueueOptions["send"]>(async () => task);
    const fallback = vi.fn(async () => task);
    return { records, store, send, fallback, queue: new UploadQueue({ store, send, fallback }) };
}

describe("待上传队列状态机（由 hook 订阅）", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("首次会话尚未就绪时等待用户初始化，不丢弃提前裁剪的照片", async () => {
        const { queue, send } = setup();
        const pending = queue.enqueue(input);
        await vi.advanceTimersByTimeAsync(0);
        expect(send).not.toHaveBeenCalled();
        await queue.setUser("A");
        expect(await pending).toEqual(task);
        expect(send).toHaveBeenCalledOnce();
    });

    it("先持久入队再发送，成功后才移除并通知订阅者", async () => {
        const { queue, store, send } = setup();
        const changed = vi.fn();
        const unsubscribe = queue.subscribe(changed);
        send.mockImplementation(async () => {
            expect(store.put).toHaveBeenCalledOnce();
            expect(queue.getSnapshot()).toHaveLength(1);
            return task;
        });
        await queue.setUser("A");
        expect(await queue.enqueue(input)).toEqual(task);
        expect(queue.getSnapshot()).toEqual([]);
        expect(store.remove).toHaveBeenCalledOnce();
        expect(changed).toHaveBeenCalledTimes(4);
        unsubscribe();
    });

    it("网络失败保留图片和幂等键，按 2、4 秒指数退避，最终成功移除", async () => {
        const { queue, send, records } = setup();
        send.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce({ status: 503 });
        await queue.setUser("A");
        expect(await queue.enqueue(input)).toBeNull();
        const first = queue.getSnapshot()[0];
        expect(first).toMatchObject({ input, attempts: 1, blocked: false, nextAttemptAt: Date.now() + 2000 });
        expect(records.size).toBe(1);
        await queue.retry();
        expect(send).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(2000);
        await queue.retry();
        expect(queue.getSnapshot()[0]).toMatchObject({ attempts: 2, nextAttemptAt: Date.now() + 4000 });
        await vi.advanceTimersByTimeAsync(4000);
        await queue.retry();
        expect(send).toHaveBeenCalledTimes(3);
        expect(send.mock.calls.every(call => call[1] === first.id)).toBe(true);
        expect(records.size).toBe(0);
    });

    it.each([400, 401, 403, 415, 429])("%s 业务错误不自动重试，可删除", async status => {
        const { queue, send, records } = setup();
        send.mockRejectedValue({ status, data: { message: "AI_CONSENT_REQUIRED" } });
        await queue.setUser("A");
        await queue.enqueue(input);
        expect(queue.getSnapshot()[0]).toMatchObject({ blocked: true });
        await vi.advanceTimersByTimeAsync(600000);
        await queue.retry();
        expect(send).toHaveBeenCalledOnce();
        await queue.remove(queue.getSnapshot()[0].id);
        expect(records.size).toBe(0);
    });

    it.each([408, 500, 502, 504])("%s 超时或服务器错误允许重传", async status => {
        const { queue, send } = setup();
        send.mockRejectedValue({ status });
        await queue.setUser("A");
        await queue.enqueue(input);
        expect(queue.getSnapshot()[0].blocked).toBe(false);
    });

    it("用户隔离，重新加载可恢复当前用户照片，退出登录清空所有记录", async () => {
        const { queue, send, store, records, fallback } = setup();
        send.mockRejectedValue(new TypeError("network"));
        await queue.setUser("A");
        await queue.enqueue(input);
        await queue.setUser("B");
        expect(queue.getSnapshot()).toEqual([]);
        await queue.retry(true);
        expect(send).toHaveBeenCalledOnce();
        const reopened = new UploadQueue({ store, send, fallback });
        await reopened.setUser("A");
        expect(reopened.getSnapshot()).toHaveLength(1);
        await queue.setUser(null);
        expect(records.size).toBe(0);
    });

    it("IndexedDB 不可用时降级原有上传，不产生额外错误", async () => {
        const { queue, store, fallback } = setup();
        store.list.mockRejectedValue(new Error("SecurityError"));
        await queue.setUser("A");
        expect(await queue.enqueue(input)).toEqual(task);
        expect(fallback).toHaveBeenCalledOnce();
        expect(queue.getSnapshot()).toEqual([]);
    });

    it("写入配额不足时降级原有上传", async () => {
        const { queue, store, fallback } = setup();
        store.put.mockRejectedValue(new Error("QuotaExceededError"));
        await queue.setUser("A");
        await queue.enqueue(input);
        expect(fallback).toHaveBeenCalledOnce();
    });

    it("并发重试合并为一次请求，登出取消进行中的上传且不写回照片", async () => {
        const { queue, send, records } = setup();
        let rejectUpload: (error: Error) => void = () => undefined;
        send.mockImplementation((_input, _id, signal) => new Promise((_resolve, reject) => {
            rejectUpload = reject;
            signal.addEventListener("abort", () => reject(new Error("aborted")));
        }));
        await queue.setUser("A");
        const pending = queue.enqueue(input);
        await vi.advanceTimersByTimeAsync(0);
        const retry = queue.retry(true);
        expect(send).toHaveBeenCalledOnce();
        await queue.setUser(null);
        rejectUpload(new Error("aborted"));
        await Promise.all([pending, retry]);
        expect(records.size).toBe(0);
        expect(queue.getSnapshot()).toEqual([]);
    });

    it("浏览器没有 IndexedDB 时存储适配器拒绝，由队列无声降级", async () => {
        const store = createUploadQueueStore();
        await expect(store.list("A")).rejects.toBeDefined();
    });
});
