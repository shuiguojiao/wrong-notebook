import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(), count: vi.fn(), findUnique: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {
    user: { findUnique: mocks.user }, agentToken: mocks,
    $transaction: (operation: (tx: unknown) => Promise<unknown>) => operation({ agentToken: mocks }),
} }));
import { GET, POST } from "@/app/api/user/agent-tokens/route";
import { DELETE } from "@/app/api/user/agent-tokens/[id]/route";
import { withAgentUser } from "@/lib/api-handler";

beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ user: { email: "u1@example.com" } });
    mocks.user.mockResolvedValue({ id: "u1", email: "u1@example.com", isActive: true });
});
describe("个人访问令牌接口", () => {
    it("管理接口要求会话，Bearer 不能创建新令牌", async () => {
        mocks.session.mockResolvedValue(null);
        expect((await GET()).status).toBe(401);
        expect((await POST(new Request("http://localhost", { method: "POST" }))).status).toBe(401);
    });
    it("列表仅查当前用户且不返回哈希", async () => {
        mocks.findMany.mockResolvedValue([]);
        expect((await GET()).status).toBe(200);
        const args = mocks.findMany.mock.calls[0][0];
        expect(args.where).toEqual({ userId: "u1" });
        expect(args.select).not.toHaveProperty("tokenHash");
    });
    it("创建返回一次明文，拒绝超限和非法到期时间", async () => {
        mocks.count.mockResolvedValue(0);
        mocks.create.mockResolvedValue({ id: "t1" });
        const request = (data: unknown) => new Request("http://localhost", { method: "POST", body: JSON.stringify(data) });
        const response = await POST(request({ name: "Codex" }));
        expect(response.status).toBe(201);
        expect((await response.json()).token).toMatch(/^wnb_/);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        mocks.count.mockResolvedValue(20);
        expect((await POST(request({ name: "Codex" }))).status).toBe(409);
        expect((await POST(request({ name: "Codex", expiresAt: "2000-01-01T00:00:00Z" }))).status).toBe(400);
    });
    it("撤销操作不能修改其他用户的令牌", async () => {
        mocks.updateMany.mockResolvedValue({ count: 0 });
        expect((await DELETE(undefined, { params: Promise.resolve({ id: "other-token" }) })).status).toBe(404);
        expect(mocks.updateMany.mock.calls[0][0].where).toEqual({ id: "other-token", userId: "u1", revokedAt: null });
    });
    it("代理鉴权不依赖会话，拒绝无令牌和撤销令牌", async () => {
        const handler = vi.fn(async () => Response.json({ ok: true }));
        const wrapped = withAgentUser(handler);
        expect((await wrapped(new Request("http://localhost"))).status).toBe(401);
        mocks.findUnique.mockResolvedValue({ revokedAt: new Date(), user: { isActive: true } });
        const request = () => new Request("http://localhost", { headers: { Authorization: `Bearer wnb_${"a".repeat(43)}` } });
        expect((await wrapped(request())).status).toBe(401);
        expect(handler).not.toHaveBeenCalled();
        const user = { id: "u1", email: "u1@example.com", isActive: true, role: "user" };
        mocks.findUnique.mockResolvedValue({ id: "t1", lastUsedAt: new Date(), user });
        expect((await wrapped(request())).status).toBe(200);
        expect(handler.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({ user, session: expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }) })]));
        expect(mocks.session).not.toHaveBeenCalled();
    });
});
