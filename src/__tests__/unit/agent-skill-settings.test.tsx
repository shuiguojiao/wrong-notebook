import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSkillSettings } from "@/components/settings/agent-skill-settings";
import { LanguageProvider } from "@/contexts/LanguageContext";

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const copy = vi.fn();
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});
async function render() {
    await act(async () => root.render(<LanguageProvider><AgentSkillSettings /></LanguageProvider>));
}
describe("Skill 设置", () => {
    it("显示服务端版本，复制一行更新命令并反馈", async () => {
        fetchMock.mockResolvedValue(Response.json({ version: 7, downloadUrl: "https://notes.example.com/api/agent/skill" }));
        copy.mockResolvedValue(undefined);
        await render();
        expect(container.textContent).toContain("当前 Skill 版本: 7");
        const button = container.querySelector("button");
        expect(button?.textContent).toBe("复制更新命令");
        await act(async () => button?.click());
        const command = copy.mock.calls[0][0] as string;
        expect(command).toContain("https://notes.example.com/api/agent/skill");
        expect(command).toContain("WRONG_NOTEBOOK_TOKEN");
        expect(command).not.toContain("\n");
        expect(container.querySelector('[role="status"]')?.textContent).toBeTruthy();
    });
    it("版本加载失败不显示假版本，保留会话下载链接", async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
        await render();
        expect(container.textContent).toContain("Skill 版本加载失败");
        expect(container.textContent).not.toContain("当前 Skill 版本:");
        expect(container.querySelector("a")?.getAttribute("href")).toBe("/api/agent-skill");
        expect(container.querySelector("button")).toBeNull();
    });
});
