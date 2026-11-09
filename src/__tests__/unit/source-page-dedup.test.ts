// @vitest-environment node
import type { Prisma } from "@prisma/client";
import { PNG } from "pngjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sourcePage: { findUnique: vi.fn(), create: vi.fn() }, $transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { saveSourcePage } from "@/lib/source-page";

const bytes = PNG.sync.write(new PNG({ width: 8, height: 10 }));
beforeEach(() => {
    db.sourcePage.findUnique.mockReset();
    db.sourcePage.create.mockReset();
    db.$transaction.mockImplementation((operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => operation(db as unknown as Prisma.TransactionClient));
});

describe("出处页哈希去重", () => {
    it("新页记录原始字节的哈希和尺寸，同用户命中时复用且不覆盖元信息", async () => {
        db.sourcePage.findUnique.mockResolvedValue(null);
        db.sourcePage.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "page", ...data }));
        const first = await saveSourcePage("user", bytes, "image/png", { fileName: "试卷.png", pageNumber: 2 });
        expect(first.reused).toBe(false);
        expect(first.page).toMatchObject({ width: 8, height: 10, origin: "agent", sha256: expect.stringMatching(/^[a-f0-9]{64}$/), imageUrl: expect.stringMatching(/^local-image:/) });
        db.sourcePage.findUnique.mockResolvedValue(first.page);
        const second = await saveSourcePage("user", bytes, "image/png", { fileName: "另一名称.png" });
        expect(second).toEqual({ page: first.page, reused: true });
        expect(db.sourcePage.create).toHaveBeenCalledTimes(1);
        expect(db.sourcePage.findUnique).toHaveBeenLastCalledWith({ where: { userId_sha256: { userId: "user", sha256: first.page.sha256 } } });
    });
    it("事务内再次去重，处理读取后另一上传已写入的情况", async () => {
        const page = { id: "concurrent" };
        db.sourcePage.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(page);
        expect(await saveSourcePage("user", bytes, "image/png")).toEqual({ page, reused: true });
        expect(db.sourcePage.create).not.toHaveBeenCalled();
    });
});
