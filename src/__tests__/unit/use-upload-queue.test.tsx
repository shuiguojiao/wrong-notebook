import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useUploadQueue, useUploadQueueLifecycle, UploadQueueContext } from "@/lib/hooks/use-upload-queue";
import type { QueuedUpload } from "@/lib/import/upload-queue-store";

const mocks = vi.hoisted(() => ({
    session: { data: { user: { id: "A" } } as { user: { id: string } } | null, status: "authenticated" },
    records: new Map<string, QueuedUpload>(),
    create: vi.fn(),
    current: "A",
    sessionLookup: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiClient: { get: mocks.sessionLookup } }));
vi.mock("next-auth/react", () => ({ useSession: () => mocks.session }));
vi.mock("@/lib/import/import-task-client", () => ({
    createImportTask: mocks.create,
    newClientRequestId: () => crypto.randomUUID(),
}));
vi.mock("@/lib/import/upload-queue-store", () => ({ createUploadQueueStore: () => ({
    list: async (userId: string) => [...mocks.records.values()].filter(item => item.userId === userId),
    put: async (item: QueuedUpload) => { mocks.records.set(item.id, structuredClone(item)); },
    remove: async (id: string) => { mocks.records.delete(id); },
    clear: async () => { mocks.records.clear(); },
}) }));

let root: Root;
let element: HTMLDivElement;
let result: ReturnType<typeof useUploadQueue>;
function Probe() {
    const value = useUploadQueue();
    useEffect(() => { result = value; });
    return <div>{value.items.length}</div>;
}
function Harness() {
    const queue = useUploadQueueLifecycle();
    return <UploadQueueContext.Provider value={queue}><Probe /></UploadQueueContext.Provider>;
}
beforeEach(async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.records.clear();
    mocks.session = { data: { user: { id: "A" } }, status: "authenticated" };
    mocks.current = "A";
    mocks.sessionLookup.mockReset().mockResolvedValue({});
    mocks.create.mockReset().mockRejectedValue(new TypeError("network"));
    element = document.createElement("div"); document.body.append(element); root = createRoot(element);
    await act(async () => root.render(<Harness />));
});
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.useRealTimers(); });

it("hook 入队、订阅持久队列，退避后 online 事件自动重传并清理", async () => {
    await act(async () => { await result.queue.enqueue({ language: "zh", imageBase64: "photo" }); });
    expect(element.textContent).toBe("1");
    mocks.create.mockResolvedValue({ id: "task" });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); window.dispatchEvent(new Event("online")); });
    expect(element.textContent).toBe("0");
    expect(mocks.records.size).toBe(0);
    expect(mocks.create).toHaveBeenCalledTimes(2);
});

it("4xx 不因回到页面或计时器自动重试，手动操作可重试", async () => {
    mocks.create.mockRejectedValue({ status: 403 });
    await act(async () => { await result.queue.enqueue({ language: "zh", imageBase64: "photo" }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); document.dispatchEvent(new Event("visibilitychange")); });
    expect(mocks.create).toHaveBeenCalledOnce();
    mocks.create.mockResolvedValue({ id: "task" });
    await act(async () => { await result.queue.retry(true); });
    expect(element.textContent).toBe("0");
});

it("hook 随登录用户切换隐藏其他用户的照片，登出清空本机存储", async () => {
    await act(async () => { await result.queue.enqueue({ language: "zh", imageBase64: "photo" }); });
    mocks.session = { data: { user: { id: "B" } }, status: "authenticated" };
    mocks.current = "B";
    await act(async () => root.render(<Harness />));
    expect(element.textContent).toBe("0");
    expect(mocks.records.size).toBe(1);
    mocks.session = { data: null, status: "unauthenticated" };
    await act(async () => root.render(<Harness />));
    expect(mocks.records.size).toBe(0);
});

it("另一标签页会话已切换时不把旧照片发送给新用户", async () => {
    mocks.current = "B";
    mocks.create.mockRejectedValue({ status: 401 });
    await act(async () => { await result.queue.enqueue({ language: "zh", imageBase64: "photo" }); });
    expect(mocks.create).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({ userId: "A", attempts: 1 }));
    expect(result.items[0].blocked).toBe(true);
});

it("其他标签页退出登录时立即取消并清空当前标签页队列", async () => {
    await act(async () => { await result.queue.enqueue({ language: "zh", imageBase64: "photo" }); });
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "wrong-notebook:uploads-cleared", newValue: "1" })));
    expect(element.textContent).toBe("0");
    expect(mocks.records.size).toBe(0);
});

it("弱网造成临时空会话时不会误删已持久保存的照片", async () => {
    await act(async () => { await result.queue.enqueue({ language: "zh", imageBase64: "photo" }); });
    mocks.sessionLookup.mockRejectedValue(new TypeError("network"));
    mocks.session = { data: null, status: "unauthenticated" };
    await act(async () => root.render(<Harness />));
    expect(mocks.records.size).toBe(1);
    mocks.session = { data: { user: { id: "A" } }, status: "authenticated" };
    await act(async () => root.render(<Harness />));
    expect(result.items).toHaveLength(1);
});
