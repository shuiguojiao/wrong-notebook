// @vitest-environment node
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $executeRawUnsafe: mocks.execute } }));

import { localImagePath, storeImage } from "@/lib/image-storage";
import { inspectDatabase } from "@/lib/server-backup/database";
import * as backupFiles from "@/lib/server-backup/files";
import { atomicJson, mirrorPath, readManifest, readStatus } from "@/lib/server-backup/files";
import { backupOverview, triggerBackup, waitForBackup } from "@/lib/server-backup/service";
import { listSnapshots } from "@/lib/server-backup/snapshots";

let directory: string;
let client: PrismaClient;
let live: DatabaseSync;
let backups: string;

beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "server-backup-'"));
    backups = path.join(directory, "backups");
    vi.stubEnv("DATABASE_URL", `file:${path.join(directory, "live.db")}`);
    vi.stubEnv("BACKUP_DIR", backups);
    vi.stubEnv("BACKUP_KEEP", "2");
    vi.stubEnv("BACKUP_ENABLED", "true");
    live = new DatabaseSync(path.join(directory, "live.db"));
    live.exec('PRAGMA journal_mode=WAL; CREATE TABLE User (id TEXT); CREATE TABLE ErrorItem (id TEXT, image TEXT); CREATE TABLE ImportBatch (draft TEXT); INSERT INTO User VALUES (\'u1\');');
    client = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    mocks.execute.mockImplementation((sql: string) => client.$executeRawUnsafe(sql));
});
afterEach(async () => {
    await waitForBackup();
    await client.$disconnect();
    live.close();
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
});

async function run() {
    expect(triggerBackup()).toBe(true);
    const result = await waitForBackup();
    expect(result?.result).toBe("success");
    const snapshots = await listSnapshots(backups);
    return path.join(backups, snapshots[0].name);
}

 describe("服务端快照备份", () => {
    it("VACUUM 快照包含 WAL 数据且完整性检查通过；状态原子持久化", async () => {
        live.exec("INSERT INTO ErrorItem VALUES ('e1', '')");
        const snapshot = await run();
        expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("VACUUM INTO"));
        expect(inspectDatabase(path.join(snapshot, "database.sqlite"))).toMatchObject({ integrity: "ok", users: 1, errorItems: 1 });
        const status = await readStatus(backups);
        expect(status).toMatchObject({ result: "success", errorCode: null, lastSuccessAt: expect.any(String), manifest: { referencedImages: 0 } });
        expect((await readManifest(snapshot)).database.size).toBe((await stat(path.join(snapshot, "database.sqlite"))).size);
        expect((await backupOverview()).stale).toBe(false);
    });

    it("增量复制并从草稿收集引用；第二次不重复复制", async () => {
        const reference = await storeImage("data:image/png;base64,YmFja3VwLWltYWdl");
        live.prepare("INSERT INTO ImportBatch VALUES (?)").run(JSON.stringify({ items: [{ image: reference }] }));
        const first = await run();
        expect((await readManifest(first)).copiedImages).toBe(1);
        expect(await readFile(mirrorPath(backups, reference), "utf8")).toBe("backup-image");
        const second = await run();
        expect((await readManifest(second)).copiedImages).toBe(0);
    });

    it("损坏和缺失图片计数但不发布快照，不清理已有完整备份", async () => {
        await run();
        const reference = await storeImage("data:image/png;base64,YmFkLWltYWdl");
        await writeFile(localImagePath(reference), "damaged");
        live.prepare("INSERT INTO ErrorItem VALUES (?, ?)").run("bad", reference);
        live.prepare("INSERT INTO ErrorItem VALUES (?, ?)").run("missing", `local-image:${"0".repeat(64)}.png`);
        expect(triggerBackup()).toBe(true);
        expect(await waitForBackup()).toMatchObject({ result: "failed", errorCode: "BACKUP_IMAGES_INVALID", lastSuccessAt: expect.any(String), manifest: { corruptImages: 1, missingImages: 1 } });
        await expect(stat(mirrorPath(backups, reference))).rejects.toMatchObject({ code: "ENOENT" });
        expect(await listSnapshots(backups)).toHaveLength(1);
    });

    it("保留最近两份，最后引用被淘汰后才回收镜像", async () => {
        const reference = await storeImage("data:image/png;base64,b2xkLWltYWdl");
        live.prepare("INSERT INTO ErrorItem VALUES (?, ?)").run("e1", reference);
        await run();
        live.exec("DELETE FROM ErrorItem");
        await run();
        expect((await stat(mirrorPath(backups, reference))).isFile()).toBe(true);
        await run();
        expect(await listSnapshots(backups)).toHaveLength(2);
        await expect(stat(mirrorPath(backups, reference))).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("并发手动及定时触发只执行一次", async () => {
        expect(triggerBackup()).toBe(true);
        expect(triggerBackup()).toBe(false);
        expect(triggerBackup()).toBe(false);
        await waitForBackup();
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(await listSnapshots(backups)).toHaveLength(1);
    });

    it("目录不可写时失败留在内存，正常状态查询可显示错误", async () => {
        await writeFile(backups, "不是目录");
        expect(triggerBackup()).toBe(true);
        expect(await waitForBackup()).toMatchObject({ result: "failed", errorCode: "ENOTDIR" });
        expect((await backupOverview()).status.result).toBe("failed");
    });

    it("新失败不能持久化时，管理状态仍覆盖磁盘上的旧成功记录", async () => {
        await run();
        const previous = await readStatus(backups);
        const error = Object.assign(new Error("禁止写入"), { code: "EACCES" });
        vi.spyOn(backupFiles, "atomicJson").mockRejectedValueOnce(error).mockRejectedValueOnce(error);
        expect(triggerBackup()).toBe(true);
        expect(await waitForBackup()).toMatchObject({ result: "failed", errorCode: "EACCES" });
        expect((await readStatus(backups)).result).toBe("success");
        expect((await backupOverview()).status).toMatchObject({ result: "failed", errorCode: "EACCES", lastSuccessAt: previous.lastSuccessAt });
    });

    it("状态可读写；超过48小时警告；重启遗留 running 标记为中断", async () => {
        const old = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
        await atomicJson(path.join(backups, "status.json"), { startedAt: old, finishedAt: null, lastSuccessAt: old, result: "running", errorCode: null, manifest: null });
        expect(await backupOverview()).toMatchObject({ stale: true, status: { result: "failed", errorCode: "BACKUP_INTERRUPTED" } });
    });
});
