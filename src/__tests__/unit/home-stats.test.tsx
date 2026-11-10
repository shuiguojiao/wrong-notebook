import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { LanguageProvider } from "@/contexts/LanguageContext";

const mocks = vi.hoisted(() => ({ get: vi.fn(), search: "" }));
vi.mock("@/lib/api-client", () => ({ apiClient: { get: mocks.get } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }));
vi.mock("@/lib/page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/lib/frontend-logger", () => ({ frontendLogger: { error: vi.fn() } }));
vi.mock("@/components/student/today-task-status", () => ({ TodayTaskStatus: () => null }));
vi.mock("@/components/checks/check-entry", () => ({ CheckEntry: () => null }));
vi.mock("@/components/question-entry/import-workspace", () => ({
    ImportWorkspace: ({ notebookName }: { notebookName?: string }) => <div>{notebookName}</div>,
}));

const urls = ["/api/notebooks", "/api/error-items/list?pageSize=1", "/api/review/due?pageSize=1"];
const labels = ["错题本", "道错题", "今天要复习"];
const notebooks = [{ id: "math", name: "数学本", _count: { errorItems: 99 } }];
let root: Root;
let container: HTMLDivElement;

function deferred() {
    let resolve!: (value: unknown) => void;
    const promise = new Promise<unknown>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}
function tile(label: string) {
    return [...container.querySelectorAll("section a, section button")].find(node => node.textContent?.startsWith(label))!;
}
async function render() {
    await act(async () => root.render(<LanguageProvider><Home /></LanguageProvider>));
}
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.setItem("app-language", "zh");
    mocks.search = "";
    mocks.get.mockReset().mockImplementation(async (url: string) => url === urls[0] ? notebooks : { total: url === urls[1] ? 12 : 3 });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe("首页统计", () => {
    it("延迟时三项显示骨架，不出现假 0，各请求完成后分别显示数字", async () => {
        const pending = urls.map(() => deferred());
        mocks.get.mockImplementation((url: string) => pending[urls.indexOf(url)].promise);
        await render();
        for (const label of labels) {
            expect(tile(label).querySelector('[aria-busy="true"]')).not.toBeNull();
            expect(tile(label).querySelector(".animate-pulse, .motion-safe\\:animate-pulse")).not.toBeNull();
            expect(tile(label).textContent).not.toContain("0");
            expect(tile(label).textContent).not.toContain("–");
        }
        await act(async () => pending[1].resolve({ total: 12 }));
        expect(tile(labels[1]).textContent).toBe("道错题12");
        expect(tile(labels[0]).querySelector('[aria-busy="true"]')).not.toBeNull();
        expect(tile(labels[2]).querySelector('[aria-busy="true"]')).not.toBeNull();
        await act(async () => pending[0].resolve(notebooks));
        expect(tile(labels[0]).textContent).toBe("错题本1");
        expect(tile(labels[1]).textContent).toBe("道错题12");
        await act(async () => pending[2].resolve({ total: 3 }));
        expect(tile(labels[2]).textContent).toBe("今天要复习3");
        expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    });

    it.each([0, 1, 2])("第 %i 项失败显示短横线，可单独重试且重试期间使用骨架", async index => {
        const pending = deferred();
        mocks.get.mockImplementation(async (url: string) => {
            if (url === urls[index]) throw new Error("离线");
            return url === urls[0] ? notebooks : { total: 3 };
        });
        await render();
        const failed = tile(labels[index]);
        expect(failed.tagName).toBe("BUTTON");
        expect(failed.textContent).toContain("–");
        expect(failed.getAttribute("aria-label")).toContain("加载失败 · 重试");
        expect(failed.textContent).not.toContain("0");
        labels.filter((_, other) => other !== index).forEach(label => {
            expect(tile(label).querySelector('[aria-busy="false"]')).not.toBeNull();
            expect(tile(label).textContent).not.toContain("–");
        });
        mocks.get.mockImplementation(() => pending.promise);
        await act(async () => (failed as HTMLButtonElement).click());
        expect(mocks.get).toHaveBeenCalledTimes(4);
        expect(mocks.get.mock.calls[3][0]).toBe(urls[index]);
        expect(tile(labels[index]).querySelector('[aria-busy="true"]')).not.toBeNull();
        expect(tile(labels[index]).textContent).not.toContain("0");
        await act(async () => pending.resolve(index === 0 ? notebooks : { total: 7 }));
        expect(tile(labels[index]).tagName).toBe("A");
        expect(tile(labels[index]).textContent).toBe(`${labels[index]}${index === 0 ? 1 : 7}`);
    });

    it("成功取得的 0 正常显示，统计链接保持正确", async () => {
        mocks.get.mockImplementation(async (url: string) => url === urls[0] ? [] : { total: 0 });
        await render();
        labels.forEach((label, index) => {
            expect(tile(label).textContent).toBe(`${label}0`);
            expect(tile(label).getAttribute("href")).toBe(index === 2 ? "/review" : "/notebooks");
        });
    });

    it("错题本成功加载后保留目标录入信息，其他统计失败不影响目标", async () => {
        mocks.search = "notebook=math";
        mocks.get.mockImplementation(async (url: string) => {
            if (url === urls[0]) return notebooks;
            throw new Error("离线");
        });
        await render();
        expect(container.textContent).toContain("录入到：数学本");
        expect(container.lastElementChild?.textContent).toContain("数学本");
    });

    it("卸载时取消所有统计请求", async () => {
        mocks.get.mockImplementation(() => new Promise(() => {}));
        await render();
        const signals = mocks.get.mock.calls.map(([, options]) => (options as { signal: AbortSignal }).signal);
        await act(async () => root.render(<></>));
        expect(signals).toHaveLength(3);
        expect(signals.every(signal => signal.aborted)).toBe(true);
    });
});
