import { afterEach, describe, expect, it, vi } from "vitest";
import { agentPublicOrigin } from "@/lib/agent/client-config";

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
