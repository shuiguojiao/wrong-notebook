import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupPromptCard } from "@/components/question-entry/agent/setup-prompt-card";
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
        expect(prompt).toContain(language === "zh" ? "Key 直接发到对话里" : "directly in this conversation");
        expect(prompt).toContain(language === "zh" ? "不要写进 Git 仓库、日志或公开文件" : "Keep it out of Git repositories, logs and public files");
        expect(prompt).toContain(language === "zh" ? "可直接使用我发给你的 Key" : "Use the Key I send you directly");
        expect(prompt).not.toContain(language === "zh" ? "不要让我把令牌发到对话里" : "Do not ask me to paste");
        expect(prompt).not.toMatch(/wnb_[A-Za-z0-9_-]{10,}/);
    });

    it("复制按钮复制完整提示词并反馈", async () => {
        copy.mockResolvedValue(undefined);
        await act(async () => root.render(<LanguageProvider><SetupPromptCard origin="https://notes.example.com" /></LanguageProvider>));
        expect(container.textContent).toContain("① 复制这段话，发给你的 AI 助手");
        const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "复制提示词");
        expect(button?.textContent).toBe("复制提示词");
        await act(async () => button?.click());
        expect(copy).toHaveBeenCalledWith(agentSetupPrompt("https://notes.example.com", "zh"));
        expect(container.querySelector('[role="status"]')?.textContent).toBeTruthy();
    });

    it("预览默认约三行，支持展开与收起", async () => {
        await act(async () => root.render(<LanguageProvider><SetupPromptCard origin="https://notes.example.com" /></LanguageProvider>));
        const toggle = container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(container.querySelector("pre")?.classList.contains("line-clamp-3")).toBe(true);
        await act(async () => toggle.click());
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(container.querySelector("pre")?.classList.contains("line-clamp-3")).toBe(false);
        await act(async () => toggle.click());
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("剪贴板不可用时提示复制失败", async () => {
        copy.mockRejectedValue(new Error("denied"));
        await act(async () => root.render(<LanguageProvider><SetupPromptCard origin="https://notes.example.com" /></LanguageProvider>));
        await act(async () => Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "复制提示词")?.click());
        expect(container.querySelector('[role="status"]')?.textContent).toBeTruthy();
    });
});
