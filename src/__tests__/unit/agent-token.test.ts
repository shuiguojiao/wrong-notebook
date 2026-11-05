import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { agentToken: mocks } }));
vi.mock("@/lib/db-write-queue", () => ({
    serializeWrite: (operation: () => Promise<unknown>) => operation(),
    runSerializedTransaction: (operation: (tx: unknown) => Promise<unknown>) => operation({ agentToken: mocks }),
}));
import { createAgentToken, hashAgentToken, validateAgentToken } from "@/lib/agent-token";

const token = `wnb_${"a".repeat(43)}`;
const user = { id: "u1", isActive: true };
beforeEach(() => { vi.resetAllMocks(); });

describe("代理令牌", () => {
    it("随机生成明文且仅持久化 SHA-256 与前缀", async () => {
        mocks.count.mockResolvedValue(0);
        mocks.create.mockImplementation(async ({ data }) => ({ id: "t1", ...data }));
        const created = await createAgentToken("u1", "Codex");
        expect(created?.token).toMatch(/^wnb_[A-Za-z0-9_-]{43}$/);
        const data = mocks.create.mock.calls[0][0].data;
        expect(data.tokenHash).toBe(hashAgentToken(created!.token));
        expect(data.tokenHash).toHaveLength(64);
        expect(data.tokenPrefix).toBe(created!.token.slice(0, 8));
        expect(data).not.toHaveProperty("token");
        expect((await createAgentToken("u1", "Codex"))?.token).not.toBe(created?.token);
    });
    it("达到 20 个时不再创建", async () => {
        mocks.count.mockResolvedValue(20);
        expect(await createAgentToken("u1", "Codex")).toBeNull();
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it.each([
        null,
        { user, revokedAt: new Date() },
        { user, expiresAt: new Date(0) },
        { user: { ...user, isActive: false } },
    ])("拒绝不存在、撤销、过期或停用用户的令牌", async (record) => {
        mocks.findUnique.mockResolvedValue(record);
        expect(await validateAgentToken(token)).toBeNull();
        expect(mocks.updateMany).not.toHaveBeenCalled();
    });
    it("有效令牌解析用户，使用时间每分钟最多更新一次", async () => {
        mocks.findUnique.mockResolvedValue({ id: "t1", user, lastUsedAt: new Date() });
        expect(await validateAgentToken(token)).toEqual(user);
        expect(mocks.updateMany).not.toHaveBeenCalled();
        mocks.findUnique.mockResolvedValue({ id: "t1", user, lastUsedAt: new Date(0) });
        expect(await validateAgentToken(token)).toEqual(user);
        expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "t1", revokedAt: null }) }));
    });
    it("格式错误时不查询数据库", async () => {
        expect(await validateAgentToken("invalid")).toBeNull();
        expect(mocks.findUnique).not.toHaveBeenCalled();
    });
});
