import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorListContent } from "@/components/error-list/error-list-content";
import { NotebookListHeader } from "@/components/error-list/notebook-list-header";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { confirmDialog } from "@/lib/feedback";
import type { ErrorItemSummary } from "@/types/api";

const { push, removeNotebook } = vi.hoisted(() => ({ push: vi.fn(), removeNotebook: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/feedback", () => ({ confirmDialog: vi.fn(async () => true), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/hooks/use-paper-groups", () => ({ usePaperGroups: () => ({ groups: [{ id: "paper-a", name: "A 卷", isActive: true }], loading: false }) }));
vi.mock("@/components/retag-notebook-button", () => ({ RetagNotebookButton: ({ renderAction }: { renderAction: (action: { start: () => void; disabled: boolean; message: null }) => ReactNode }) => renderAction({ start: vi.fn(), disabled: false, message: null }) }));
vi.mock("@/components/error-list-selection-bar", () => ({ ErrorListSelectionBar: ({ selectedIds, onCancel, onDelete }: { selectedIds: string[]; onCancel: () => void; onDelete: () => void }) => <aside data-testid="selection-bar"><span>{selectedIds.join(",")}</span><button onClick={onCancel}>取消多选</button><button onClick={onDelete}>删除选中</button></aside> }));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let rows: ErrorItemSummary[];
const button = (text: string, parent: ParentNode = document) => [...parent.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent === text)!;
const click = async (text: string, parent: ParentNode = document) => act(async () => { button(text, parent).click(); });
const listRows = () => container.querySelectorAll('[data-testid="error-row"]');

beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    push.mockReset(); removeNotebook.mockReset();
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    rows = Array.from({ length: 6 }, (_, index) => ({ id: `q${index}`, questionText: `根据拼音写出汉字。\n题目${index}`, createdAt: "2026-11-09T01:00:00Z", source: "语文.pdf｜第1页", masteryStatus: index === 5 ? "mastered" : "new", tags: [{ name: "字音字形" }], originalImageUrl: index === 0 ? "/api/error-items/q0/image?v=1" : "" }));
    vi.mocked(apiClient.get).mockImplementation(async url => {
        if (url === "/api/user") return {};
        if (url.startsWith("/api/tags")) return { tags: [{ id: "g", name: "七年级上", children: [{ id: "c", name: "第一章", children: [{ id: "t", name: "字音字形", children: [] }] }] }] };
        const params = new URL(url, "http://localhost").searchParams;
        let filtered = params.get("mastery") ? rows.filter(row => row.masteryStatus === params.get("mastery")) : rows;
        if (params.get("query")) filtered = filtered.filter(row => row.questionText?.includes(params.get("query")!));
        return { items: filtered.slice(0, Number(params.get("pageSize"))), total: filtered.length, totalPages: filtered.length ? 1 : 0, page: 1, pageSize: 18 };
    });
    vi.mocked(apiClient.post).mockImplementation(async (_url, body) => { const ids = (body as { ids: string[] }).ids; rows = rows.filter(row => !ids.includes(row.id)); return {}; });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function render(initialMastery?: "reviewing") {
    await act(async () => root.render(<LanguageProvider><ErrorListContent subjectId="book" subjectName="语文" initialMastery={initialMastery}
        renderHeader={controls => <NotebookListHeader notebook={{ id: "book", name: "语文", userId: "u", createdAt: "", updatedAt: "" }} controls={controls} onRename={vi.fn()} onDelete={removeNotebook} onRetagFinished={vi.fn()} />}
    /></LanguageProvider>));
}

async function menu() {
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="更多"]')!;
    await act(async () => { trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
}

describe("错题列表 A4", () => {
    it("分组显示六道自身内容，只保留首个知识点、状态和有图题的缩略图", async () => {
        await render();
        expect(listRows()).toHaveLength(6);
        expect(container.textContent).toContain("11月9日 ·语文.pdf· 6 道");
        expect(container.textContent).toContain("6 道 · 待复习 5");
        expect(container.textContent).not.toContain("根据拼音写出汉字");
        expect(container.querySelectorAll("img")).toHaveLength(1);
        expect(container.querySelector('[aria-label="已生效的筛选"]')).toBeNull();
        await act(async () => container.querySelector<HTMLImageElement>("img")!.click());
        expect(push).toHaveBeenCalledWith("/error-items/q0");
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(container.querySelector('[data-slot="card"]')).toBeNull();
    });
    it("菜单承接旧工具；三段切换使用现有参数，打印携带相同筛选", async () => {
        await render();
        expect(button("多选", container)).toBeUndefined();
        await act(async () => { container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2].click(); });
        expect(listRows()).toHaveLength(1);
        expect(vi.mocked(apiClient.get).mock.calls.some(([url]) => url.includes("mastery=mastered"))).toBe(true);
        await menu();
        await act(async () => { [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent === "导出打印")!.click(); });
        expect(push).toHaveBeenCalledWith("/print-preview?subjectId=book&mastery=mastered");
        await menu();
        await act(async () => { [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent === "删除")!.click(); });
        expect(removeNotebook).toHaveBeenCalledTimes(1);
    });
    it("筛选面板合并时间、卷别和题型；标签逐项移除后不占位置", async () => {
        await render(); await click("筛选");
        const dialog = document.querySelector('[role="dialog"]')!;
        await click("最近一周", dialog); await click("A 卷", dialog); await click("填空题", dialog);
        const latest = vi.mocked(apiClient.get).mock.calls.at(-1)![0];
        expect(latest).toContain("timeRange=week"); expect(latest).toContain("paperLevel=paper-a"); expect(latest).toContain("questionTypes=fill_blank");
        await click("完成", dialog);
        for (const label of ["最近一周", "A 卷", "填空题"]) await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="移除筛选：${label}"]`)!.click());
        expect(container.querySelector('[aria-label="已生效的筛选"]')).toBeNull();
    });
    it("筛选面板重新打开后恢复年级、章节和知识点，并按层级清除", async () => {
        await render(); await click("筛选");
        const choose = async (index: number, label: string) => {
            const trigger = document.querySelectorAll<HTMLElement>('[role="combobox"]')[index];
            await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
            const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(element => element.textContent === label)!;
            await act(async () => option.click());
        };
        await choose(0, "七年级上"); await choose(1, "第一章"); await choose(2, "字音字形");
        const latest = new URL(vi.mocked(apiClient.get).mock.calls.at(-1)![0], "http://localhost").searchParams;
        expect(latest.get("gradeSemester")).toBe("七年级上"); expect(latest.get("chapter")).toBe("第一章"); expect(latest.get("tag")).toBe("字音字形");
        await click("完成"); await click("筛选");
        expect([...document.querySelectorAll('[role="combobox"]')].map(element => element.textContent)).toEqual(["七年级上", "第一章", "字音字形"]);
        await click("完成");
        await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="移除筛选：第一章"]')!.click());
        expect(container.querySelector('[aria-label="移除筛选：字音字形"]')).toBeNull();
        expect(container.querySelector('[aria-label="移除筛选：七年级上"]')).not.toBeNull();
        await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="移除筛选：七年级上"]')!.click());
        expect(container.querySelector('[aria-label="已生效的筛选"]')).toBeNull();
    });
    it("旧 URL 的 reviewing 状态仍可筛选，并可从面板或条件标签恢复全部", async () => {
        await render("reviewing");
        expect(vi.mocked(apiClient.get).mock.calls.some(([url]) => url.includes("mastery=reviewing"))).toBe(true);
        expect(container.querySelector('[aria-label="移除筛选：复习中"]')).not.toBeNull();
        await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="移除筛选：复习中"]')!.click());
        expect(listRows()).toHaveLength(6);
    });
    it("长按进入多选且抬手不导航，底部删除沿用确认和选中 ID", async () => {
        await render(); vi.useFakeTimers();
        const first = listRows()[0];
        await act(async () => { first.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true, clientX: 10, clientY: 10 })); vi.advanceTimersByTime(500); });
        await act(async () => { first.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })); first.querySelector<HTMLAnchorElement>("a")!.click(); });
        expect(push).not.toHaveBeenCalled();
        expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(6);
        expect(container.querySelector('[data-testid="selection-bar"]')!.textContent).toContain("q0");
        await click("删除选中");
        expect(confirmDialog).toHaveBeenCalledWith("确定删除 1 道错题？", { destructive: true });
        expect(apiClient.post).toHaveBeenCalledWith("/api/error-items/batch-delete", { ids: ["q0"] });
        expect(listRows()).toHaveLength(5);
        expect(container.textContent).toContain("5 道 · 待复习 4");
    });
    it("滚动手势取消长按；菜单可进入和退出多选", async () => {
        await render(); vi.useFakeTimers();
        const first = listRows()[0];
        await act(async () => { first.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true })); first.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientY: 30 })); vi.advanceTimersByTime(600); });
        expect(container.querySelector('[role="checkbox"]')).toBeNull();
        vi.useRealTimers();
        await menu();
        await act(async () => { [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent === "多选")!.click(); });
        await act(async () => container.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
        expect(container.querySelector('[data-testid="selection-bar"]')!.textContent).toContain("q0");
        await click("取消多选");
        expect(container.querySelector('[role="checkbox"]')).toBeNull();
    });
});
