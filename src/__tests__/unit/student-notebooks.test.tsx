import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotebookCard } from "@/components/notebook-card";
import { RowFigure } from "@/components/error-list/row-figure";
import { ErrorListContent } from "@/components/error-list/error-list-content";
import { ErrorRow } from "@/components/error-list/error-row";
import { NotebookListHeader } from "@/components/error-list/notebook-list-header";
import { NotebookShelf } from "@/components/student/notebook-shelf";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import type { ErrorItemSummary, Notebook } from "@/types/api";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ apiClient: { get: vi.fn() } }));
vi.mock("@/lib/hooks/use-paper-groups", () => ({ usePaperGroups: () => ({ groups: [], loading: false }) }));
vi.mock("@/components/retag-notebook-button", () => ({ RetagNotebookButton: ({ renderAction }: { renderAction: (action: { start: () => void; message: null }) => ReactNode }) => renderAction({ start: vi.fn(), message: null }) }));

const notebook: Notebook = { id: "math", name: "数学", subjectKey: "math", userId: "u", createdAt: "", updatedAt: "", _count: { errorItems: 10 }, progress: { mastered: 3, unmastered: 7, dueToday: 2 } };
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const render = async (element: ReactNode) => act(async () => root.render(<LanguageProvider>{element}</LanguageProvider>));

beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    push.mockReset();
    vi.mocked(apiClient.get).mockImplementation(async url => {
        if (url === "/api/notebooks") return [notebook];
        if (url.includes("/figure")) return { svg: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5" /></svg>' };
        if (url === "/api/error-items/short/AbC234") return { id: "q1" };
        if (url.startsWith("/api/error-items/short/")) throw new Error("404");
        if (url.startsWith("/api/error-items/list")) return { items: [], total: 0, totalPages: 0, dueTodayCount: 0 };
        return {};
    });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

async function enterSearch(value: string) {
    const input = container.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return input;
}

describe("学生错题本封面与配图", () => {
    it("封面展示科目、总数、真实掌握进度和今日数量，当前本有可访问的高亮", async () => {
        const click = vi.fn();
        await render(<NotebookCard name="数学" subjectKey="math" errorCount={10} progress={notebook.progress} active onClick={click} />);
        expect(container.textContent).toContain("10 题");
        expect(container.textContent).toContain("已掌握 3 · 还没掌握 7");
        expect(container.textContent).toContain("今天要复习 2");
        expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("3");
        expect(container.querySelector('[aria-current="page"]')).toBeTruthy();
        expect(container.querySelector('[aria-current="page"]')?.classList.contains("outline-2")).toBe(true);
        expect(container.querySelector('[aria-current="page"]')?.classList.contains("outline-offset-4")).toBe(true);
        await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
        expect(click).toHaveBeenCalledOnce();
    });
    it("选本栏只为当前本描边，切换本子后同步当前状态", async () => {
        const notebooks = [notebook, { ...notebook, id: "english", name: "英语", subjectKey: "english" }];
        await render(<NotebookShelf activeId="math" notebooks={notebooks} />);
        expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
        expect(container.querySelector('[aria-current="page"]')?.textContent).toContain("数学");
        await render(<NotebookShelf activeId="english" notebooks={notebooks} />);
        const active = container.querySelector('[aria-current="page"]');
        expect(active?.textContent).toContain("英语");
        expect(active?.classList.contains("outline-2")).toBe(true);
        expect(container.querySelector('.student-notebook-cover:not([aria-current])')?.classList.contains("outline-2")).toBe(false);
    });
    it.each([true, false])("今天标签只依据服务端队列标记 %s，队列内隐藏重复下次日期", async isDueToday => {
        const item: ErrorItemSummary = { id: "q", createdAt: "2026-11-09T00:00:00Z", questionText: "方程题", masteryStatus: "new", nextReviewAt: "2026-11-10T00:00:00Z", isDueToday };
        await render(<ErrorRow item={item} preview="方程题" selectMode={false} selected={false} onToggleSelect={vi.fn()} onLongPress={vi.fn()} />);
        expect(container.querySelector("mark")?.textContent ?? null).toBe(isDueToday ? "今天" : null);
        expect(container.textContent?.includes("下次")).toBe(!isDueToday);
        await render(<ErrorRow item={{ ...item, wrongCount: 2 }} preview="方程题" selectMode={false} selected={false} onToggleSelect={vi.fn()} onLongPress={vi.fn()} />);
        expect(container.textContent).toContain("错过 2 次");
    });
    it.each(["today", "queued", "later"] as const)("服务端复习状态 %s 对应今天、排队或下次日期", async reviewState => {
        const item: ErrorItemSummary = { id: "q", createdAt: "2026-11-09T00:00:00Z", nextReviewAt: "2026-11-11T00:00:00Z", reviewState, isDueToday: reviewState === "today" };
        const row = (wrongCount = 0) => <ErrorRow item={{ ...item, wrongCount }} preview="方程题" selectMode={false} selected={false} onToggleSelect={vi.fn()} onLongPress={vi.fn()} />;
        await render(row());
        expect(container.querySelector("mark")?.textContent ?? null).toBe(reviewState === "today" ? "今天" : null);
        expect(container.textContent?.includes("下次 11月11日")).toBe(reviewState === "later");
        const queued = container.querySelector('[title="今天的复习时长已排满，之后会轮到"]');
        expect(queued?.textContent ?? null).toBe(reviewState === "queued" ? "排队中" : null);
        await render(row(2));
        expect(container.textContent).toContain("错过 2 次");
        expect(container.textContent?.includes("排队中")).toBe(reviewState === "queued");
        expect(container.textContent).not.toContain("下次");
    });
    it.each([
        ["/api/error-items/q/figure", true, 1, false],
        [undefined, true, 0, true],
        [undefined, false, 0, false],
    ] as const)("配图地址 %s、出处 %s 只展示对应的配图或回形针", async (url, hasSource, imageCount, paperclip) => {
        await render(<RowFigure url={url} hasSource={hasSource} />);
        expect(container.querySelectorAll("img")).toHaveLength(imageCount);
        expect(container.textContent?.includes("原图")).toBe(paperclip);
        if (imageCount) expect(container.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
        expect(vi.mocked(apiClient.get).mock.calls.some(([path]) => path.includes("/image"))).toBe(false);
    });
    it("无效配图或读取失败回退到原图标识，变更地址不复用上一题配图", async () => {
        await render(<RowFigure url="/figure/first" hasSource />);
        expect(container.querySelector("img")).toBeTruthy();
        vi.mocked(apiClient.get).mockRejectedValue(new Error("网络断开"));
        await render(<RowFigure url="/figure/second" hasSource />);
        expect(container.querySelector("img")).toBeNull();
        expect(container.textContent).toContain("原图");
    });
    it("复习入口使用 subjectId，今天为零时隐藏，优先采用列表的同份快照数量", async () => {
        const header = (dueToday: number) => <NotebookListHeader notebook={notebook} controls={{ total: 10, pending: 7, dueToday, selecting: false, exportPrint: vi.fn(), toggleSelect: vi.fn() }} onRename={vi.fn()} onDelete={vi.fn()} onRetagFinished={vi.fn()} />;
        await render(header(2));
        expect(container.textContent).toContain("10 题 · 已掌握 3 · 还没掌握 7");
        expect(container.querySelector('a[href*="/review/session"]')?.getAttribute("href")).toBe("/review/session?subjectId=math&autostart=1");
        expect(container.querySelector('a[href*="/review/session"]')?.textContent).toBe("复习这本 · 2 题");
        expect([...container.querySelectorAll("header p > span")].map(span => span.textContent)).toEqual(["10 题", " · 已掌握 3", " · 还没掌握 7"]);
        expect([...container.querySelectorAll("header p > span")].every(span => span.classList.contains("whitespace-nowrap"))).toBe(true);
        await render(header(0));
        expect(container.querySelector('a[href*="/review/session"]')).toBeNull();
        expect(container.textContent).not.toContain("这本今天没有要复习的");
        expect(container.querySelectorAll("header a")).toHaveLength(1);
    });
    it.each(["shelf", "list"])("%s 搜索框在窄屏使用短提示，切换宽度保留输入与焦点", async target => {
        let compact = true;
        const listeners = new Set<() => void>();
        vi.stubGlobal("matchMedia", () => ({ matches: compact, addEventListener: (_event: string, callback: () => void) => listeners.add(callback), removeEventListener: (_event: string, callback: () => void) => listeners.delete(callback) }));
        await render(target === "shelf" ? <NotebookShelf /> : <ErrorListContent subjectId="math" />);
        const input = await enterSearch("AbC234");
        expect(input.placeholder).toBe("搜题目或题号");
        expect(input.getAttribute("aria-label")).toBe("搜题目、知识点，或输入 6 位题号");
        input.focus();
        await act(async () => { compact = false; listeners.forEach(listener => listener()); });
        expect(input.placeholder).toBe("搜题目、知识点，或输入 6 位题号");
        expect(input.value).toBe("AbC234");
        expect(document.activeElement).toBe(input);
        await act(async () => { compact = true; listeners.forEach(listener => listener()); });
        expect(input.placeholder).toBe("搜题目或题号");
    });
    it("封面搜索框回车精确定位短编号，失败给出提示，普通文字搜索题目与知识点", async () => {
        await render(<NotebookShelf />);
        await enterSearch("AbC234");
        await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
        expect(push).toHaveBeenCalledWith("/error-items/q1");
        await enterSearch("XyZ789");
        await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
        expect(container.querySelector('[role="alert"]')?.textContent).toBe("没有找到这个 ID 对应的题目");
        await enterSearch("方程");
        expect(vi.mocked(apiClient.get).mock.calls.some(([url]) => new URL(url, "http://localhost").searchParams.get("query") === "方程")).toBe(true);
    });
    it("本内搜索保留短编号定位入口", async () => {
        await render(<ErrorListContent subjectId="math" />);
        const input = await enterSearch("AbC234");
        await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
        expect(push).toHaveBeenCalledWith("/error-items/q1");
    });
});
