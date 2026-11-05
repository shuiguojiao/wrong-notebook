// @vitest-environment node
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { storeImage } from "@/lib/image-storage";
import { atomicJson, databaseMetadata, mirrorPath } from "@/lib/server-backup/files";
import { mirrorImages } from "@/lib/server-backup/snapshots";
import { verifyBackup } from "@/lib/server-backup/verify";

let directory: string;
let snapshot: string;
let reference: string;
beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "verify-backup-"));
    snapshot = path.join(directory, `snapshot-2026-11-05T00-00-00-000Z-${randomUUID()}`);
    await mkdir(snapshot);
    reference = await storeImage("data:image/png;base64,dmVyaWZ5LWltYWdl");
    const filename = path.join(snapshot, "database.sqlite");
    const db = new DatabaseSync(filename);
    db.exec('CREATE TABLE User (id TEXT); CREATE TABLE ErrorItem (id TEXT, originalImageUrl TEXT); INSERT INTO User VALUES (\'u1\')');
    db.prepare("INSERT INTO ErrorItem VALUES (?, ?)").run("e1", reference);
    db.close();
    const images = await mirrorImages(directory, [reference]);
    await atomicJson(path.join(snapshot, "manifest.json"), {
        version: 1, createdAt: "2026-11-05T00:00:00.000Z", appVersion: "test", backupVersion: 12,
        database: await databaseMetadata(filename), images: [reference], referencedImages: 1,
        ...images, durationMs: 1,
    });
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe("备份验证命令", () => {
    it("快照目录与 manifest 路径均可验证；只读扫描不会修改数据库", async () => {
        const original = await readFile(path.join(snapshot, "database.sqlite"));
        expect(await verifyBackup(snapshot)).toMatchObject({ ok: true, integrity: "ok", users: 1, errorItems: 1, referencedImages: 1, databaseHashValid: true });
        expect((await verifyBackup(path.join(snapshot, "manifest.json"))).ok).toBe(true);
        expect(await readFile(path.join(snapshot, "database.sqlite"))).toEqual(original);
    });
    it.each(["missing", "corrupt"])("检测镜像图片 %s", async (kind) => {
        if (kind === "missing") await rm(mirrorPath(directory, reference));
        else await writeFile(mirrorPath(directory, reference), "corrupt");
        const result = await verifyBackup(snapshot);
        expect(result.ok).toBe(false);
        expect(result[kind === "missing" ? "missingImages" : "corruptImages"]).toBe(1);
    });
    it("检测数据库校验和不匹配、清单漏引用与无效 SQLite", async () => {
        const filename = path.join(snapshot, "manifest.json");
        const manifest = JSON.parse(await readFile(filename, "utf8"));
        await atomicJson(filename, { ...manifest, images: [], database: { ...manifest.database, sha256: "0".repeat(64) } });
        expect(await verifyBackup(snapshot)).toMatchObject({ ok: false, errors: ["DATABASE_CHECKSUM_MISMATCH", "MANIFEST_REFERENCES_MISMATCH"] });
        await writeFile(path.join(snapshot, "database.sqlite"), "not sqlite");
        expect((await verifyBackup(snapshot)).ok).toBe(false);
    });
    it("不存在的数据库不会被验证器创建", async () => {
        await rm(path.join(snapshot, "database.sqlite"));
        expect((await verifyBackup(snapshot)).ok).toBe(false);
        await expect(readFile(path.join(snapshot, "database.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
    });
    it("CLI 对完好备份退出0，对缺图退出非0并输出 JSON", async () => {
        const args = ["--conditions=react-server", "scripts/backup-verify.cjs", snapshot];
        const good = spawnSync(process.execPath, args, { encoding: "utf8" });
        expect(good.status, good.stderr).toBe(0);
        expect(JSON.parse(good.stdout)).toMatchObject({ ok: true, users: 1, errorItems: 1 });
        await rm(mirrorPath(directory, reference));
        const bad = spawnSync(process.execPath, args, { encoding: "utf8" });
        expect(bad.status, bad.stderr).toBe(1);
        expect(JSON.parse(bad.stdout)).toMatchObject({ ok: false, missingImages: 1 });
    }, 30000);
});
