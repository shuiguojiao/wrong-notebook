import { afterEach, describe, expect, it, vi } from "vitest";
import { agentClientConfig, agentPublicOrigin, agentSetupPrompt } from "@/lib/agent/client-config";

describe("agentPublicOrigin", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("配置 NEXTAUTH_URL 时使用公开地址", () => {
        vi.stubEnv("NEXTAUTH_URL", "https://notes.example.com/app");
        expect(agentPublicOrigin("http://0.0.0.0:3000/api/mcp")).toBe("https://notes.example.com");
    });

    it("未配置或配置无效时回退请求地址", () => {
        vi.stubEnv("NEXTAUTH_URL", "");
        expect(agentPublicOrigin("http://localhost:3000/api/mcp")).toBe("http://localhost:3000");
        vi.stubEnv("NEXTAUTH_URL", "ftp://notes.example.com");
        expect(agentPublicOrigin("http://localhost:3000/api/mcp")).toBe("http://localhost:3000");
        vi.stubEnv("NEXTAUTH_URL", "https://user:pass@notes.example.com");
        expect(agentPublicOrigin("http://localhost:3000/api/mcp")).toBe("http://localhost:3000");
    });
});

describe("客户端配置", () => {
    it("Claude Code 和 Cursor 使用各自环境变量语法，所有配置与提示词不包含令牌明文", () => {
        const config = agentClientConfig("https://notes.example.com");
        expect(JSON.parse(config.claude).mcpServers["wrong-notebook"]).toEqual({ type: "http", url: config.url, headers: { Authorization: "Bearer ${WRONG_NOTEBOOK_TOKEN}" } });
        expect(JSON.parse(config.cursor).mcpServers["wrong-notebook"].headers.Authorization).toBe("Bearer ${env:WRONG_NOTEBOOK_TOKEN}");
        for (const value of [...Object.values(config), agentSetupPrompt("https://notes.example.com", "zh"), agentSetupPrompt("https://notes.example.com", "en")]) {
            expect(value).not.toMatch(/wnb_[A-Za-z0-9_-]{10,}/);
        }
    });
});
