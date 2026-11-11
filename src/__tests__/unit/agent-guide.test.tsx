import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentGuide, connectionMinutes, formatConnectionAge } from "@/components/question-entry/agent/agent-guide";
import { AgentIntegrationSettings } from "@/components/settings/agent-integration-settings";
import { LanguageProvider, loadEnTranslations } from "@/contexts/LanguageContext";
import type { TokenRecord } from "@/lib/hooks/use-agent-tokens";

let container: HTMLDivElement;
let root: Root;
let tokens: TokenRecord[];
const fetchMock = vi.fn();
const copy = vi.fn();
const token = (overrides: Partial<TokenRecord> = {}): TokenRecord => ({
    id: "1", name: "旧 Key", tokenPrefix: "wnb_prefix", lastUsedAt: null, expiresAt: null, revokedAt: null, ...overrides,
});
function button(text: string) {
    const result = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === text);
    expect(result).toBeTruthy();
    return result!;
}
async function render(advancedOpen = false) {
    await act(async () => root.render(<LanguageProvider><AgentGuide notebookName="数学" advancedOpen={advancedOpen} /></LanguageProvider>));
}
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    tokens = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    copy.mockResolvedValue(undefined);
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes("version")) return Promise.resolve(Response.json({ version: 4, downloadUrl: "https://example.com/api/agent/skill" }));
        if (options?.method === "POST") return Promise.resolve(Response.json({ token: "wnb_test_secret_once" }));
        if (options?.method === "DELETE") { tokens = tokens.map((item) => ({ ...item, revokedAt: new Date().toISOString() })); }
        return Promise.resolve(Response.json({ tokens }));
    });
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove(); fetchMock.mockReset(); copy.mockReset(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear();
});

describe("AI 助手接入", () => {
    it("格式化最近调用时间", () => {
        expect(connectionMinutes(null, 180000)).toBeNull();
        expect(connectionMinutes("invalid", 180000)).toBeNull();
        expect(connectionMinutes("1970-01-01T00:01:00Z", 180000)).toBe(2);
        expect(connectionMinutes("1970-01-01T00:04:00Z", 180000)).toBe(0);
    });
    it("三步渲染，高级默认收起，生成 Key 无需名称且不传到期时间", async () => {
        await render();
        expect(Array.from(container.querySelectorAll("h4")).slice(0, 3).map((heading) => heading.textContent)).toEqual([
            "① 复制这段话，发给你的 AI 助手", "② 你的 Key", "③ 试试这样说",
        ]);
        expect(container.querySelector("header")?.textContent).toContain("等待 AI 助手连接");
        expect(container.querySelector<HTMLDetailsElement>('[data-testid="agent-advanced"]')?.open).toBe(false);
        expect(container.querySelector("input")).toBeNull();
        const create = button("生成 Key");
        expect(create.disabled).toBe(false);
        await act(async () => create.click());
        const request = fetchMock.mock.calls.find(([, options]) => options?.method === "POST");
        const date = new Date();
        expect(JSON.parse(request?.[1].body)).toEqual({ name: `AI 助手 · ${date.getMonth() + 1}月${date.getDate()}日` });
        expect(container.textContent).toContain("wnb_test_secret_once");
        await act(async () => button("复制 Key").click());
        expect(copy).toHaveBeenCalledWith("wnb_test_secret_once");
        await act(async () => button("隐藏").click());
        expect(container.textContent).not.toContain("wnb_test_secret_once");
    });
    it("英文使用对应默认名称", async () => {
        await loadEnTranslations();
        localStorage.setItem("app-language", "en");
        await render();
        await act(async () => button("Generate Key").click());
        const request = fetchMock.mock.calls.find(([, options]) => options?.method === "POST");
        const date = new Date();
        expect(JSON.parse(request?.[1].body)).toEqual({ name: `AI Assistant · ${date.toLocaleString("en", { month: "short" })} ${date.getDate()}` });
    });
    it("六条示例整行复制，替换错题本名称，反馈复制失败", async () => {
        await render();
        const examples = Array.from(container.querySelectorAll<HTMLButtonElement>("section > ul button"));
        expect(examples).toHaveLength(6);
        for (const example of examples) {
            await act(async () => example.click());
            expect(copy).toHaveBeenLastCalledWith(example.textContent);
            expect(example.textContent).not.toContain("{notebook}");
        }
        expect(examples[0].textContent).toContain("〈数学〉");
        expect(examples[1].textContent).toContain("PDF");
        expect(examples[2].textContent).toContain("最近一周");
        expect(examples[4].textContent).toContain("7CFw66");
        expect(examples[5].textContent).toContain("原图出处");
        copy.mockRejectedValueOnce(new Error("denied"));
        await act(async () => examples[0].click());
        expect(container.textContent).toContain("复制失败");
        await act(async () => root.render(<LanguageProvider><AgentGuide /></LanguageProvider>));
        expect(container.textContent).toContain("〈当前错题本〉");
    });
    it("高级可默认展开并切换客户端、查看旧到期时间和撤销 Key", async () => {
        tokens = [token({ expiresAt: "2099-01-01T00:00:00Z" })];
        await render(true);
        expect(container.querySelector<HTMLDetailsElement>('[data-testid="agent-advanced"]')?.open).toBe(true);
        expect(container.textContent).toContain("2099");
        const select = container.querySelector("select")!;
        await act(async () => { select.value = "claude"; select.dispatchEvent(new Event("change", { bubbles: true })); });
        await act(async () => button("复制配置").click());
        expect(copy.mock.calls.at(-1)?.[0]).toContain("${WRONG_NOTEBOOK_TOKEN}");
        await act(async () => button("撤销").click());
        expect(fetchMock).toHaveBeenCalledWith("/api/user/agent-tokens/1", { method: "DELETE" });
        expect(button("已撤销").disabled).toBe(true);
    });
    it("设置页复用相同三步，高级默认展开", async () => {
        await act(async () => root.render(<LanguageProvider><AgentIntegrationSettings /></LanguageProvider>));
        expect(container.querySelector<HTMLDetailsElement>('[data-testid="agent-advanced"]')?.open).toBe(true);
        expect(container.querySelectorAll("select")).toHaveLength(1);
        expect(container.querySelectorAll("input")).toHaveLength(0);
        expect(container.querySelectorAll("h3")).toHaveLength(1);
    });
    it("只计有效 Key，已连接显示在标题旁且生成按钮为次要样式", async () => {
        tokens = [token({ lastUsedAt: new Date(Date.now() - 120000).toISOString() }),
            token({ id: "2", revokedAt: new Date().toISOString() }),
            token({ id: "3", expiresAt: "2000-01-01T00:00:00Z" })];
        await render();
        expect(container.querySelector("header")?.textContent).toContain("已连接 · 2 分钟前");
        expect(container.textContent).toContain("已有 1 个有效 Key，可直接用");
        expect(button("生成 Key").classList.contains("bg-background")).toBe(true);
    });
    it("每 15 秒刷新，卸载后停止", async () => {
        vi.useFakeTimers();
        await render();
        const count = () => fetchMock.mock.calls.filter(([url]) => url === "/api/user/agent-tokens").length;
        const initial = count();
        tokens = [token({ lastUsedAt: new Date().toISOString() })];
        await act(async () => vi.advanceTimersByTime(15000));
        expect(count()).toBe(initial + 1);
        expect(container.querySelector("header")?.textContent).toContain("已连接 · 刚刚");
        await act(async () => root.render(null));
        await act(async () => vi.advanceTimersByTime(30000));
        expect(count()).toBe(initial + 1);
    });
    it("连接时间按分钟、小时、天显示", () => {
        const text = { justNow: "刚刚", minutesAgo: "{n} 分钟前", hoursAgo: "{n} 小时前", daysAgo: "{n} 天前" };
        expect(formatConnectionAge(0, text)).toBe("刚刚");
        expect(formatConnectionAge(59, text)).toBe("59 分钟前");
        expect(formatConnectionAge(831, text)).toBe("13 小时前");
        expect(formatConnectionAge(2880, text)).toBe("2 天前");
    });
});
