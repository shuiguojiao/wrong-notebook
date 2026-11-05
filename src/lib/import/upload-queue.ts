import { getApiErrorMessage, getErrorMessage } from "@/lib/error-message";
import { newClientRequestId } from "@/lib/import/import-task-client";
import type { CreateImportTaskInput } from "@/lib/import/import-task-client";
import type { ImportTaskDetail } from "@/lib/import/import-task-types";
import type { ImportBatchDetail } from "@/lib/import/import-batch-types";
import type { QueuedUpload, UploadQueueInput, UploadQueueStore } from "@/lib/import/upload-queue-store";

type UploadResult = ImportTaskDetail | ImportBatchDetail;

export interface UploadQueueOptions {
    store: UploadQueueStore;
    onLogout?: () => void;
    send: (input: UploadQueueInput, id: string, signal: AbortSignal, userId: string) => Promise<UploadResult>;
    fallback: UploadQueueOptions["send"];
}

/** 网络错误、请求超时和所有 5xx 可重传；其他 4xx 需要用户处理。 */
export function isRetryableQueueError(error: unknown): boolean {
    const status = (error as { status?: number } | null)?.status;
    return status === undefined || status === 408 || status >= 500;
}

/** 页面之外的队列状态机；hook 负责订阅、登录状态和浏览器生命周期。 */
export class UploadQueue {
    private userId: string | null = null;
    private generation = 0;
    private available = true;
    private controller = new AbortController();
    private listeners = new Set<() => void>();
    private active = new Map<string, Promise<UploadResult | null>>();
    private snapshot: QueuedUpload[] = [];
    private draining: Promise<void> | null = null;
    private initialized: Promise<void>;
    private markInitialized: () => void = () => undefined;
    private writes: Promise<unknown> = Promise.resolve();

    constructor(private options: UploadQueueOptions) {
        this.initialized = new Promise(resolve => { this.markInitialized = resolve; });
    }
    getSnapshot = () => this.snapshot;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private publish(items: QueuedUpload[]) {
        this.snapshot = items;
        this.listeners.forEach(listener => listener());
    }
    private write(action: () => Promise<void>) {
        const result = this.writes.then(action);
        this.writes = result.catch(() => undefined);
        return result;
    }
    async setUser(userId: string | null) {
        if (this.userId === userId && userId !== null) return;
        if (!userId && this.userId) this.options.onLogout?.();
        this.controller.abort();
        this.controller = new AbortController();
        this.userId = userId;
        const generation = ++this.generation;
        this.publish([]);
        try {
            if (!userId) { await this.write(() => this.options.store.clear()); return; }
            await this.writes;
            const items = await this.options.store.list(userId);
            if (generation === this.generation) { this.available = true; this.publish(items); }
        } catch {
            if (generation === this.generation) this.available = false;
        } finally {
            if (generation === this.generation) this.markInitialized();
        }
    }
    enqueue(input: UploadQueueInput & { source: "image" }): Promise<ImportBatchDetail | null>;
    enqueue(input: CreateImportTaskInput): Promise<ImportTaskDetail | null>;
    async enqueue(input: UploadQueueInput): Promise<UploadResult | null> {
        // 裁剪可能早于首次会话请求完成，等账号与本机队列就绪后再持久入队。
        await this.initialized;
        const userId = this.userId;
        const generation = this.generation;
        if (!userId) throw new Error("UNAUTHORIZED");
        const id = newClientRequestId();
        const item: QueuedUpload = { id, userId, input, attempts: 0, nextAttemptAt: 0, blocked: false };
        if (this.available) {
            try {
                await this.write(() => this.options.store.put(item));
                if (generation !== this.generation) return null;
                this.publish([...this.snapshot, item]);
                return this.attempt(item);
            } catch {
                this.available = false;
            }
        }
        if (generation !== this.generation) return null;
        return this.options.fallback(input, id, this.controller.signal, userId);
    }
    private attempt(item: QueuedUpload): Promise<UploadResult | null> {
        const existing = this.active.get(item.id);
        if (existing) return existing;
        const generation = this.generation;
        const run = async () => {
            try {
                const task = await this.options.send(item.input, item.id, this.controller.signal, item.userId);
                if (generation !== this.generation) return null;
                await this.write(() => this.options.store.remove(item.id));
                this.publish(this.snapshot.filter(current => current.id !== item.id));
                return task;
            } catch (error) {
                if (generation !== this.generation) return null;
                const attempts = item.attempts + 1;
                const next = { ...item, attempts, blocked: !isRetryableQueueError(error),
                    nextAttemptAt: Date.now() + Math.min(300_000, 2000 * 2 ** Math.min(attempts - 1, 8)),
                    error: getApiErrorMessage(error) ?? getErrorMessage(error), status: (error as { status?: number } | null)?.status };
                // 写回失败仍保留原始持久记录与幂等键，下次打开页面可以恢复。
                await this.write(() => this.options.store.put(next)).catch(() => undefined);
                this.publish(this.snapshot.map(current => current.id === item.id ? next : current));
                return null;
            }
        };
        const promise = run().finally(() => this.active.delete(item.id));
        this.active.set(item.id, promise);
        return promise;
    }
    retry(manual = false): Promise<void> {
        if (this.draining) return this.draining;
        const generation = this.generation;
        const drain = async () => {
            for (const { id } of this.snapshot) {
                if (generation !== this.generation) break;
                const item = this.snapshot.find(current => current.id === id);
                if (item && (manual || (!item.blocked && item.nextAttemptAt <= Date.now()))) await this.attempt(item);
            }
        };
        this.draining = drain().finally(() => { this.draining = null; });
        return this.draining;
    }
    async remove(id: string) {
        if (this.active.has(id) || !this.snapshot.some(item => item.id === id)) return;
        await this.write(() => this.options.store.remove(id));
        this.publish(this.snapshot.filter(item => item.id !== id));
    }
}
