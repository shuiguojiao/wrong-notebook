import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), overview: vi.fn(), trigger: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));
vi.mock("@/lib/server-backup/service", () => ({ backupOverview: mocks.overview, triggerBackup: mocks.trigger }));
import { GET, POST } from "@/app/api/admin/backups/route";

beforeEach(() => {
    mocks.session.mockResolvedValue({ user: { email: "admin@example.com", role: "admin" } });
    mocks.user.mockResolvedValue({ id: "admin", role: "admin" });
    mocks.overview.mockResolvedValue({ enabled: true, directory: "/private/backups", snapshots: [] });
    mocks.trigger.mockReturnValue(true);
});
const post = (body: unknown = {}) => POST(new Request("http://localhost/api/admin/backups", { method: "POST", body: JSON.stringify(body) }));
describe("管理员备份接口", () => {
    it("管理员可读取位置与快照列表，响应禁止缓存", async () => {
        const result = await GET();
        expect(result.status).toBe(200);
        expect(result.headers.get("Cache-Control")).toBe("no-store");
        expect(await result.json()).toMatchObject({ directory: "/private/backups", snapshots: [] });
    });
    it("手动触发立即返回202；已运行或已关闭时409", async () => {
        expect((await post()).status).toBe(202);
        expect(mocks.trigger).toHaveBeenCalledTimes(1);
        mocks.trigger.mockReturnValue(false);
        expect((await post()).status).toBe(409);
        mocks.overview.mockResolvedValue({ enabled: false });
        expect((await post()).status).toBe(409);
        expect(mocks.trigger).toHaveBeenCalledTimes(2);
    });
    it("拒绝外部路径与其他参数", async () => {
        expect((await post({ directory: "/etc" })).status).toBe(400);
        expect((await post(null)).status).toBe(400);
        expect(mocks.trigger).not.toHaveBeenCalled();
    });
    it.each(["user", "admin"])("数据库角色为 %s 时按当前权限拒绝，不泄露路径", async (role) => {
        mocks.user.mockResolvedValue({ role, isActive: role !== "admin" });
        for (const result of [await GET(), await post()]) {
            expect(result.status).toBe(403);
            expect(JSON.stringify(await result.json())).not.toContain("/private");
        }
        expect(mocks.overview).not.toHaveBeenCalled();
        expect(mocks.trigger).not.toHaveBeenCalled();
    });
    it("未登录返回401", async () => {
        mocks.session.mockResolvedValue(null);
        expect((await GET()).status).toBe(401);
        expect((await post()).status).toBe(401);
        expect(mocks.trigger).not.toHaveBeenCalled();
    });
});
