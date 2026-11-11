import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportTaskCard } from "@/components/import-tasks/import-task-card";
import { LanguageProvider, loadEnTranslations } from "@/contexts/LanguageContext";
import type { ImportTaskSummary } from "@/lib/import/import-task-types";

const mocks = vi.hoisted(() => ({ role: "user" as string | undefined }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: mocks.role ? { user: { role: mocks.role } } : null }) }));
const task: ImportTaskSummary = {
    id: "upload", status: "review", mode: "review", subjectId: null, targetSubjectId: null,
    excerpt: "求面积", batchId: null, batchItemKey: null, error: null, errorItemId: null,
    errorItemShortId: null, notebookName: null, duplicate: false, hasResult: true, unread: true,
    attempts: 1, timings: { client: { read: 14, crop: 0 }, server: { analyze: 38000, save: 343 } },
    createdAt: "2026-11-11T00:00:00Z", finishedAt: null,
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.setItem("app-language", "zh");
    mocks.role = "user";
    container = document.createElement("div"); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function render(value = task) {
    await act(async () => root.render(<LanguageProvider><ImportTaskCard task={value} onReview={vi.fn()} /></LanguageProvider>));
}

describe("识别任务的技术耗时", () => {
    it.each(["user", "teacher", undefined])("角色 %s 不渲染技术耗时与详情入口，仍能继续校对", async role => {
        mocks.role = role;
        await render();
        expect(container.querySelector("details")).toBeNull();
        expect(container.textContent).not.toContain("14ms");
        expect(container.textContent).not.toContain("38s");
        expect(container.querySelector("button")?.textContent).toBe("继续校对");
    });
    it("管理员可展开默认折叠的详情，保留零耗时阶段", async () => {
        mocks.role = "admin";
        await render();
        const details = container.querySelector("details")!;
        expect(details.open).toBe(false);
        expect(details.querySelector("summary")?.textContent).toBe("详情");
        expect([...details.querySelectorAll("li")].map(node => node.textContent)).toEqual(["读取 14ms", "裁剪 0ms", "AI 识别 38s", "保存 343ms"]);
        await act(async () => details.querySelector("summary")!.click());
        expect(details.open).toBe(true);
        mocks.role = "user"; await render();
        expect(container.querySelector("details")).toBeNull();
    });
    it("没有耗时时管理员也不显示空详情", async () => {
        mocks.role = "admin";
        await render({ ...task, timings: {} });
        expect(container.querySelector("details")).toBeNull();
    });
    it("英文详情与耗时列表名称使用翻译", async () => {
        mocks.role = "admin";
        localStorage.setItem("app-language", "en"); await loadEnTranslations();
        await render();
        expect(container.querySelector("summary")?.textContent).toBe("Details");
        expect(container.querySelector("ul")?.getAttribute("aria-label")).toBe("Stage timings");
    });
});
