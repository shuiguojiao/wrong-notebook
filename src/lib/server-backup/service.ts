import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { BACKUP_VERSION } from "../backup/format";
import { getAppVersion } from "../app-version";
import { createLogger } from "../logger";
import { prisma } from "../prisma";
import { inspectDatabase } from "./database";
import { atomicJson, backupOptions, databaseMetadata, errorCode, readStatus } from "./files";
import { emptyStatus } from "./schema";
import { listSnapshots, mirrorImages, pruneSnapshots } from "./snapshots";
import type { BackupOverview, BackupStatus } from "./schema";

const logger = createLogger("server-backup");
const shared = globalThis as typeof globalThis & {
    __serverBackup?: { pending?: Promise<BackupStatus>; latest?: { directory: string; status: BackupStatus } };
};
const state = shared.__serverBackup ??= {};

async function performBackup(): Promise<BackupStatus> {
    let directory = "";
    let temporary = "";
    let status = emptyStatus();
    const started = Date.now();
    try {
        const options = backupOptions();
        directory = options.directory;
        status = await readStatus(directory);
        status = { ...status, result: "running", startedAt: new Date(started).toISOString(), finishedAt: null, errorCode: null, manifest: null };
        state.latest = { directory, status };
        if (!options.enabled) throw Object.assign(new Error("备份已关闭"), { code: "BACKUP_DISABLED" });
        await atomicJson(path.join(directory, "status.json"), status);
        const name = `snapshot-${status.startedAt!.replace(/[:.]/g, "-")}-${randomUUID()}`;
        temporary = path.join(directory, `.${name}.tmp`);
        await mkdir(temporary, { recursive: true, mode: 0o700 });
        const database = path.join(temporary, "database.sqlite");
        // 路径完全由服务端生成；SQLite 不支持在 VACUUM INTO 中绑定 Prisma 参数，单引号必须转义。
        await prisma.$executeRawUnsafe(`VACUUM INTO '${database.replace(/'/g, "''")}'`);
        const inspected = await inspectDatabase(database);
        const images = await mirrorImages(directory, inspected.images);
        status.manifest = {
            version: 1, createdAt: status.startedAt!, appVersion: getAppVersion(), backupVersion: BACKUP_VERSION,
            database: await databaseMetadata(database), images: inspected.images, referencedImages: inspected.images.length,
            complete: images.missingImages === 0 && images.corruptImages === 0,
            ...images, durationMs: Date.now() - started,
        };
        await atomicJson(path.join(temporary, "manifest.json"), status.manifest);
        // 数据库和清单作为一个目录原子发布，未发布快照不会进入保留列表。
        await rename(temporary, path.join(directory, name));
        temporary = "";
        await pruneSnapshots(directory, options.keep);
        status = { ...status, result: status.manifest.complete ? "success" : "partial", finishedAt: new Date().toISOString() };
        const success = { ...status, lastSuccessAt: status.finishedAt, lastCompleteAt: status.manifest?.complete ? status.finishedAt : status.lastCompleteAt };
        await atomicJson(path.join(directory, "status.json"), success);
        status = success;
        logger.info({ durationMs: status.manifest?.durationMs, copiedImages: images.copiedImages }, "服务端备份完成");
    } catch (error) {
        status = { ...status, startedAt: status.startedAt || new Date(started).toISOString(), result: "failed", finishedAt: new Date().toISOString(), errorCode: errorCode(error) };
        logger.warn({ code: status.errorCode }, "服务端备份失败");
        if (directory) {
            try { await atomicJson(path.join(directory, "status.json"), status); }
            catch (writeError) { logger.warn({ code: errorCode(writeError) }, "无法持久化备份状态"); }
        }
    } finally {
        if (temporary) {
            try { await rm(temporary, { recursive: true, force: true }); }
            catch (error) { logger.warn({ code: errorCode(error) }, "无法清理未完成快照"); }
        }
    }
    state.latest = { directory, status };
    return status;
}

/** 同步取得进程级互斥权，覆盖手动、补跑及定时触发，也避免开发热重载重复运行。 */
export function triggerBackup(): boolean {
    if (state.pending) return false;
    state.pending = performBackup().finally(() => { state.pending = undefined; });
    return true;
}

export async function waitForBackup(): Promise<BackupStatus | undefined> {
    return state.pending;
}

export async function backupOverview(now = Date.now()): Promise<BackupOverview> {
    let options;
    try { options = backupOptions(); }
    catch {
        return { directory: process.env.BACKUP_DIR || "", keep: 7, enabled: false, running: !!state.pending, stale: true,
            status: { ...emptyStatus(), result: "failed", errorCode: "BACKUP_CONFIG_INVALID" }, snapshots: [] };
    }
    let status = emptyStatus();
    let snapshots: BackupOverview["snapshots"] = [];
    try {
        status = await readStatus(options.directory);
        snapshots = await listSnapshots(options.directory);
    } catch (error) {
        status = { ...status, result: "failed", errorCode: errorCode(error) };
    }
    const latest = state.latest?.directory === options.directory ? state.latest.status : undefined;
    // 写入失败时磁盘上可能仍是旧成功记录；只用更新的失败结果覆盖，避免掩盖后续读取错误。
    if (latest && (state.pending || (latest.result === "failed" && (!status.startedAt || Date.parse(latest.startedAt!) >= Date.parse(status.startedAt))))) {
        status = latest;
    }
    if (status.result === "running" && !state.pending) status = { ...status, result: "failed", errorCode: "BACKUP_INTERRUPTED" };
    return { ...options, running: !!state.pending, status, snapshots,
        stale: !status.lastSuccessAt || now - Date.parse(status.lastSuccessAt) > 48 * 60 * 60 * 1000 };
}
