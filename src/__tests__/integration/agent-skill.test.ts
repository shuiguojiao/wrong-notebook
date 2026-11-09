// @vitest-environment node
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));

import { GET } from "@/app/api/agent-skill/route";
import { GET as version } from "@/app/api/agent-skill/version/route";
import nextConfig from "../../../next.config";

const sourceRoot = process.cwd();
const skillDirectory = "packaging/agent-skill/wrong-notebook-import";

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXTAUTH_URL", "https://notes.example.com");
    mocks.session.mockResolvedValue({ user: { email: "u1@example.com" } });
    mocks.user.mockResolvedValue({ id: "u1", email: "u1@example.com", isActive: true });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("Skill 压缩包下载", () => {
    it("设置页元信息使用会话鉴权并返回公开地址", async () => {
        const request = new Request("http://localhost/api/agent-skill/version");
        const response = await version(request);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(await response.json()).toEqual({ version: 5, downloadUrl: "https://notes.example.com/api/agent/skill" });
        mocks.session.mockResolvedValue(null);
        expect((await version(request)).status).toBe(401);
    });
    it("未登录返回 401，提供 Bearer 也不能代替会话", async () => {
        mocks.session.mockResolvedValue(null);
        expect((await GET()).status).toBe(401);
        expect((await GET(new Request("http://localhost/api/agent-skill", {
            headers: { Authorization: `Bearer wnb_${"a".repeat(43)}` },
        }))).status).toBe(401);
        expect(mocks.user).not.toHaveBeenCalled();
    });

    it("登录后无需令牌，返回可解压的 zip、原始 Skill 与公开 MCP 地址", async () => {
        const response = await GET(new Request("http://localhost/api/agent-skill"));
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("application/zip");
        expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="wrong-notebook-import.zip"');
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
        expect(Object.keys(files).every((name) => name.startsWith("wrong-notebook-import/"))).toBe(true);
        expect(strFromU8(files["wrong-notebook-import/SKILL.md"])).toBe(
            await readFile(path.join(sourceRoot, skillDirectory, "SKILL.md"), "utf8"),
        );
        expect(strFromU8(files["wrong-notebook-import/scripts/images.py"])).toBe(
            await readFile(path.join(sourceRoot, skillDirectory, "scripts/images.py"), "utf8"),
        );
        const readme = strFromU8(files["wrong-notebook-import/README.txt"]);
        expect(readme).toContain("https://notes.example.com/api/mcp");
        expect(readme).toContain("Skill-Version: 5");
        expect(readme).not.toMatch(/Bearer|wnb_/);
    });

    it("standalone 追踪包含 Skill，独立目录中也能读取完整层级", async () => {
        expect(nextConfig.output).toBe("standalone");
        for (const route of ["/api/agent-skill", "/api/agent-skill/version", "/api/agent/skill", "/api/agent/notebooks", "/api/mcp"]) {
            expect(nextConfig.outputFileTracingIncludes?.[route]).toContain(`./${skillDirectory}/**/*`);
        }
        const standaloneRoot = await mkdtemp(path.join(os.tmpdir(), "agent-skill-"));
        try {
            await cp(path.join(sourceRoot, skillDirectory), path.join(standaloneRoot, skillDirectory), { recursive: true });
            vi.spyOn(process, "cwd").mockReturnValue(standaloneRoot);
            const response = await GET(new Request("http://localhost/api/agent-skill"));
            expect(response.status).toBe(200);
            const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
            expect(strFromU8(files["wrong-notebook-import/SKILL.md"])).toContain("name: wrong-notebook-import");
            expect((await (await version(new Request("http://localhost/api/agent-skill/version"))).json()).version).toBe(5);
        } finally {
            vi.restoreAllMocks();
            await rm(standaloneRoot, { recursive: true, force: true });
        }
    });
});
