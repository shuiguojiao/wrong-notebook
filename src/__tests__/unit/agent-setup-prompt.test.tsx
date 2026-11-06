import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSetupPrompt } from "@/components/settings/agent-setup-prompt";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { agentSetupPrompt } from "@/lib/agent/client-config";

let container: HTMLDivElement;
let root: Root;
const copy = vi.fn();
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    copy.mockReset();
});

describe("Agent 接入提示词", () => {
    it.each(["zh", "en"] as const)("%s 提示词含当前站点的 MCP 与 Skill 地址，不含令牌", (language) => {
        const prompt = agentSetupPrompt("https://notes.example.com", language);
        expect(prompt).toContain("https://notes.example.com/api/mcp");
        expect(prompt).toContain("https://notes.example.com/api/agent/skill");
        expect(prompt).toContain('bearer_token_env_var = "WRONG_NOTEBOOK_TOKEN"');
        expect(prompt).toContain("<YOUR_TOKEN>");
        expect(prompt).toContain("list_notebooks");
        expect(prompt).not.toMatch(/wnb_[A-Za-z0-9_-]{10,}/);
    });

    it("复制按钮复制完整提示词并反馈", async () => {
        copy.mockResolvedValue(undefined);
        await act(async () => root.render(<LanguageProvider><AgentSetupPrompt origin="https://notes.example.com" /></LanguageProvider>));
        expect(container.textContent).toContain("让 Agent 自动配置");
        const button = container.querySelector("button");
        expect(button?.textContent).toBe("复制提示词");
        await act(async () => button?.click());
        expect(copy).toHaveBeenCalledWith(agentSetupPrompt("https://notes.example.com", "zh"));
        expect(container.querySelector('[role="status"]')?.textContent).toBeTruthy();
    });

    it("剪贴板不可用时提示复制失败", async () => {
        copy.mockRejectedValue(new Error("denied"));
        await act(async () => root.render(<LanguageProvider><AgentSetupPrompt origin="https://notes.example.com" /></LanguageProvider>));
        await act(async () => container.querySelector("button")?.click());
        expect(container.querySelector('[role="status"]')?.textContent).toBeTruthy();
    });
});
