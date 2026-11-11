import { act, useImperativeHandle, useState } from "react";
import type { Ref } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntryPanels } from "@/components/question-entry/entry-panels";
import { zh } from "@/lib/i18n/zh";
import type { useQuestionImport } from "@/lib/hooks/use-question-import";

const importFile = vi.fn();
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "user" } } }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ t: zh }) }));
vi.mock("@/components/question-entry/album-choice", () => ({ AlbumChoice: () => null, AlbumResultsLink: () => null }));
vi.mock("@/components/file-import/file-import-panel", () => ({ FileImportPanel: ({ ref }: { ref?: Ref<unknown> }) => {
    useImperativeHandle(ref, () => ({ importFile })); return <div>文件摘要</div>;
} }));
vi.mock("@/components/text-input-zone", () => ({ TextInputZone: () => {
    const [value, setValue] = useState(""); return <input value={value} onChange={event => setValue(event.target.value)} />;
} }));
vi.mock("@/components/direct-text-editor", () => ({ DirectTextEditor: () => null }));
vi.mock("@/components/question-parts-bar", () => ({ QuestionPartsBar: () => null }));
let container: HTMLDivElement;
let root: Root;
const flow = { parts: [], pendingAlbum: [], submittedCount: 0, selectImage: vi.fn(), selectImages: vi.fn(), isBusy: false } as unknown as ReturnType<typeof useQuestionImport>;
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    container = document.createElement("div"); document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("录入来源与 AI 助手链接", () => {
    it("AI 助手改为设置链接，不再渲染 Agent 页签；受控入口保留文字和文件面板", async () => {
        const change = vi.fn();
        for (const mode of ["text", "file"] as const) {
            await act(async () => root.render(<EntryPanels flow={flow} entryMode={mode} onEntryModeChange={change} />));
            expect(container.querySelector<HTMLDivElement>(`[data-entry-panel="${mode}"]`)?.hidden).toBe(false);
        }
        expect(container.querySelector('a[href="/me#agent-settings"]')?.textContent).toBe(zh.entry.agentLink);
        expect([...container.querySelectorAll('[role="tab"]')].map(tab => tab.textContent)).toEqual([zh.entry.solve, zh.entry.haveAnswer]);
    });
    it("深链与事件聚焦来源这一排，不自动打开相机，切换时保留文字草稿节点", async () => {
        const click = vi.spyOn(HTMLInputElement.prototype, "click");
        await act(async () => root.render(<EntryPanels flow={flow} />));
        const text = container.querySelector<HTMLButtonElement>('[data-testid="entry-touch-sources"] [aria-pressed]')!;
        await act(async () => text.click());
        const draft = container.querySelector('[data-entry-panel="text"] input');
        await act(async () => root.render(<EntryPanels flow={flow} photoEntry />));
        await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
        expect(document.activeElement).toBe(container.querySelector('[data-entry-sources]'));
        expect(container.querySelector<HTMLDivElement>('[data-entry-panel="text"]')?.hidden).toBe(true);
        await act(async () => text.click());
        expect(container.querySelector('[data-entry-panel="text"] input')).toBe(draft);
        await act(async () => window.dispatchEvent(new Event("focus-photo-entry")));
        expect(document.activeElement).toBe(container.querySelector('[data-entry-sources]'));
        expect(click).not.toHaveBeenCalled();
    });
    it("通用文件选择 PDF 后切换面板并调用现有 importFile", async () => {
        await act(async () => root.render(<EntryPanels flow={flow} />));
        const file = new File(["pdf"], "paper.pdf", { type: "application/pdf" });
        const input = container.querySelector<HTMLInputElement>('[data-testid="file-input"]')!;
        Object.defineProperty(input, "files", { value: [file] });
        await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
        expect(importFile).toHaveBeenCalledWith(file);
        expect(container.querySelector<HTMLDivElement>('[data-entry-panel="file"]')?.hidden).toBe(false);
    });
});
