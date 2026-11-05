import { afterEach, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api-client";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("队列取消上传时能够中止 apiClient 内部请求", async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
        received = options.signal ?? undefined;
        received?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")));
    })));
    const pending = apiClient.post("/api/import-tasks", {}, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 408 });
    expect(received?.aborted).toBe(true);
});

it("收到响应头后仍对读取响应体计时，避免弱网响应体挂起", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => ({
        ok: true,
        status: 200,
        json: () => new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")))),
    })));
    const pending = apiClient.post("/api/import-tasks", {}, { timeout: 1000 });
    // 在推进计时器前订阅异常，避免未处理的 Promise 拒绝。
    const checked = expect(pending).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(1000);
    await checked;
});
