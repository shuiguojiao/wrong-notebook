import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentGuide, connectionMinutes } from "@/components/question-entry/agent/agent-guide";
import { LanguageProvider } from "@/contexts/LanguageContext";

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes("version")) return Promise.resolve(Response.json({ version: 4, downloadUrl: "https://example.com/api/agent/skill" }));
        if (options?.method === "POST") return Promise.resolve(Response.json({ token: "wnb_test_secret_once" }));
        return Promise.resolve(Response.json({ tokens: [] }));
    });
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); fetchMock.mockReset(); vi.unstubAllGlobals(); });

describe("Agent 录入引导", () => {
    it("格式化最近调用时间", () => {
        expect(connectionMinutes(null, 180000)).toBeNull();
        expect(connectionMinutes("invalid", 180000)).toBeNull();
        expect(connectionMinutes("1970-01-01T00:01:00Z", 180000)).toBe(2);
        expect(connectionMinutes("1970-01-01T00:04:00Z", 180000)).toBe(0);
    });
    it("显示未连接状态，切换客户端并且明文仅在创建后显示一次", async () => {
        await act(async () => root.render(<LanguageProvider><AgentGuide notebookName="数学" /></LanguageProvider>));
        expect(container.textContent).toContain("等待首次调用");
        expect(container.textContent).toContain("〈数学〉");
        const select = container.querySelector("select")!;
        await act(async () => { select.value = "claude"; select.dispatchEvent(new Event("change", { bubbles: true })); });
        expect(container.textContent).toContain("${WRONG_NOTEBOOK_TOKEN}");
        const input = container.querySelector<HTMLInputElement>("#guide-token-name")!;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        await act(async () => { setter.call(input, "test"); input.dispatchEvent(new Event("input", { bubbles: true })); });
        const create = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "创建令牌")!;
        await act(async () => create.click());
        expect(container.textContent).toContain("wnb_test_secret_once");
        const hide = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "隐藏")!;
        await act(async () => hide.click());
        expect(container.textContent).not.toContain("wnb_test_secret_once");
    });
    it("根据有效令牌显示最近调用时间", async () => {
        fetchMock.mockImplementation((url: string) => Promise.resolve(Response.json(url.includes("version") ? { version: 4, downloadUrl: "https://example.com/api/agent/skill" } : { tokens: [{ id: "1", lastUsedAt: new Date(Date.now() - 120000).toISOString(), expiresAt: null, revokedAt: null }] })));
        await act(async () => root.render(<LanguageProvider><AgentGuide /></LanguageProvider>));
        expect(container.textContent).toContain("✓ 已连接 · 2 分钟前");
    });
});
