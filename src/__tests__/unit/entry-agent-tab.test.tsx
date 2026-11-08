import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryPanels } from "@/components/question-entry/entry-panels";
import type { useQuestionImport } from "@/lib/hooks/use-question-import";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "user" } } }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ t: { entry: { images: "图片", text: "文字", files: "文件", solve: "AI", haveAnswer: "答案", draftHint: "草稿" } } }) }));
vi.mock("@/components/question-entry/agent/agent-guide", () => ({ AgentGuide: () => <div>引导内容</div> }));
vi.mock("@/components/question-entry/album-choice", () => ({ AlbumChoice: () => null, AlbumResultsLink: () => null }));
vi.mock("@/components/upload-zone", () => ({ UploadZone: () => <div>图片内容</div> }));
vi.mock("@/components/file-import/file-import-panel", () => ({ FileImportPanel: () => null }));
vi.mock("@/components/text-input-zone", () => ({ TextInputZone: () => null }));
vi.mock("@/components/direct-text-editor", () => ({ DirectTextEditor: () => null }));
vi.mock("@/components/question-parts-bar", () => ({ QuestionPartsBar: () => null }));

afterEach(() => vi.unstubAllGlobals());
describe("录入页签", () => {
    it("切换至 Agent 再返回图片", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const container = document.createElement("div"); document.body.appendChild(container);
        const root = createRoot(container);
        const flow = { parts: [], pendingAlbum: [], submittedCount: 0 } as unknown as ReturnType<typeof useQuestionImport>;
        await act(async () => root.render(<EntryPanels flow={flow} />));
        expect(container.textContent).toContain("图片内容");
        const agent = Array.from(container.querySelectorAll('[role="tab"]')).find((item) => item.textContent === "AI Agent") as HTMLButtonElement;
        await act(async () => agent.click());
        expect(agent.getAttribute("aria-selected")).toBe("true");
        expect(container.textContent).toContain("引导内容");
        const image = Array.from(container.querySelectorAll('[role="tab"]')).find((item) => item.textContent === "图片") as HTMLButtonElement;
        await act(async () => image.click());
        expect(container.textContent).not.toContain("引导内容");
        expect(container.textContent).toContain("图片内容");
        await act(async () => root.unmount()); container.remove();
    });
});
