import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NotebookListHeader } from "@/components/error-list/notebook-list-header";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { confirmDialog } from "@/lib/feedback";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ ApiError: class extends Error {}, apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/hooks/use-running-task", () => ({ useRunningTask: () => ({ running: null, refresh: vi.fn() }) }));
vi.mock("@/lib/feedback", () => ({ confirmDialog: vi.fn(async () => true), toast: { info: vi.fn() } }));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    vi.mocked(apiClient.get).mockResolvedValueOnce(null).mockResolvedValue({ total: 6, done: 6, failed: 0, running: false, finishedAt: "2026-11-09" });
    vi.mocked(apiClient.post).mockResolvedValue({ total: 6, done: 0, failed: 0, running: true, finishedAt: null });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("菜单重新识别沿用确认、进度与完成刷新，菜单关闭后继续轮询", async () => {
    const onFinished = vi.fn();
    await act(async () => root.render(<LanguageProvider><NotebookListHeader
        notebook={{ id: "book", name: "语文", userId: "u", createdAt: "", updatedAt: "" }}
        controls={{ exportPrint: vi.fn(), toggleSelect: vi.fn(), selecting: false, total: 6, pending: 6, dueToday: null }}
        onRename={vi.fn()} onDelete={vi.fn()} onRetagFinished={onFinished}
    /></LanguageProvider>));
    expect(container.querySelectorAll("button")).toHaveLength(3);
    expect(container.querySelector<HTMLButtonElement>("button:disabled")).toBeTruthy();
    await act(async () => container.querySelector('[aria-label="更多"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    vi.useFakeTimers();
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent?.includes("重新识别"))!;
    await act(async () => item.click());
    expect(confirmDialog).toHaveBeenCalledOnce();
    expect(apiClient.post).toHaveBeenCalledWith("/api/notebooks/book/retag", {});
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("0");
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(onFinished).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("6");
});
