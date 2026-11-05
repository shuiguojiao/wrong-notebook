import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { imageStorageDirectory } from "../image-storage";
import { imageReferenceSchema, manifestSchema, statusSchema, emptyStatus } from "./schema";
import type { BackupStatus } from "./schema";

const optionsSchema = z.object({
    BACKUP_KEEP: z.coerce.number().int().min(1).max(365).default(7),
    BACKUP_ENABLED: z.enum(["true", "false"]).default("true"),
});

export function backupOptions() {
    const parsed = optionsSchema.parse({ BACKUP_KEEP: process.env.BACKUP_KEEP, BACKUP_ENABLED: process.env.BACKUP_ENABLED });
    // 与 imageStorageDirectory 及 Prisma 相同：相对数据库路径基于 prisma 目录。
    const database = (process.env.DATABASE_URL || "file:./dev.db").replace(/^file:/, "").split("?")[0];
    const directory = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(path.dirname(path.resolve(process.cwd(), "prisma", database)), "backups");
    const relative = path.relative(path.join(directory, "images"), imageStorageDirectory());
    // 镜像不得覆盖或包含在线图片目录，否则回收可能删除尚未进入快照的新图片。
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
        throw new Error("BACKUP_IMAGE_DIRECTORY_OVERLAP");
    }
    return {
        directory,
        keep: parsed.BACKUP_KEEP,
        enabled: parsed.BACKUP_ENABLED === "true",
    };
}

export async function sha256(filename: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(filename)) hash.update(chunk);
    return hash.digest("hex");
}

export function mirrorPath(directory: string, reference: string): string {
    const file = imageReferenceSchema.parse(reference).slice("local-image:".length);
    return path.join(directory, "images", file.slice(0, 2), file);
}

export function errorCode(error: unknown): string {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    return typeof code === "string" && /^[A-Z_0-9]+$/.test(code) ? code : "BACKUP_FAILED";
}

export async function atomicJson(filename: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, JSON.stringify(value, null, 2), { flag: "wx", mode: 0o600 });
        await rename(temporary, filename);
    } finally {
        await rm(temporary, { force: true });
    }
}

export async function readStatus(directory: string): Promise<BackupStatus> {
    try { return statusSchema.parse(JSON.parse(await readFile(path.join(directory, "status.json"), "utf8"))); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStatus();
        throw error;
    }
}

export async function readManifest(directory: string) {
    return manifestSchema.parse(JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")));
}

/** 缺失和损坏区分报告；其他 I/O 错误不能冒充缺图。 */
export async function imageHealth(filename: string, reference: string): Promise<"ok" | "missing" | "corrupt"> {
    try { return await sha256(filename) === reference.slice(12, 76) ? "ok" : "corrupt"; }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
        throw error;
    }
}

export async function databaseMetadata(filename: string) {
    return { file: "database.sqlite" as const, size: (await stat(filename)).size, sha256: await sha256(filename) };
}
