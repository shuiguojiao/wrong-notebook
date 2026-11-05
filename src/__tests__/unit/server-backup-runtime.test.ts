// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:sqlite", () => { throw new Error("不支持内置 SQLite"); });
vi.mock("@/lib/prisma", () => ({ prisma: { $executeRawUnsafe: vi.fn().mockResolvedValue(0) } }));
import { inspectDatabase } from "@/lib/server-backup/database";
import { triggerBackup, waitForBackup } from "@/lib/server-backup/service";

let directory: string | undefined;
afterEach(async () => {
    await waitForBackup();
    if (directory) await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
});
it("模块可加载；实际备份遇到 SQLite 导入失败时记录专用错误码", async () => {
    await expect(inspectDatabase("unused.sqlite")).rejects.toMatchObject({ code: "BACKUP_NODE_UNSUPPORTED" });
    directory = await mkdtemp(path.join(tmpdir(), "backup-runtime-"));
    vi.stubEnv("BACKUP_DIR", directory);
    vi.stubEnv("BACKUP_ENABLED", "true");
    expect(triggerBackup()).toBe(true);
    expect(await waitForBackup()).toMatchObject({ result: "failed", errorCode: "BACKUP_NODE_UNSUPPORTED", lastSuccessAt: null });
});
