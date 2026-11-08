import "server-only";

import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { imageStorageDirectory, isLocalImage, localImagePath, mapDraftImages, readStoredImage, storeImage } from "./image-storage";

interface ImageRow { id: string; value: string; updatedAt?: Date }
interface ImageSource {
    read: (cursor?: string) => Promise<ImageRow[]>;
    write: (row: ImageRow, value: string) => Promise<unknown>;
    draft?: boolean;
}

/** 只扫描需要的字段并分页；更新时比较旧值，避免覆盖并发编辑。维护命令仍要求停服运行。 */
function sources(db: PrismaClient): ImageSource[] {
    const page = (cursor?: string) => ({ take: 100, orderBy: { id: "asc" as const }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    return [
        {
            read: async (cursor) => (await db.errorItem.findMany({ ...page(cursor), select: { id: true, originalImageUrl: true, updatedAt: true } })).map((row) => ({ ...row, value: row.originalImageUrl })),
            write: (row, value) => db.errorItem.updateMany({ where: { id: row.id, originalImageUrl: row.value }, data: { originalImageUrl: value, updatedAt: row.updatedAt } }),
        },
        {
            read: async (cursor) => (await db.practiceRecord.findMany({ ...page(cursor), select: { id: true, originalImageUrl: true } })).map((row) => ({ id: row.id, value: row.originalImageUrl || "" })),
            write: (row, value) => db.practiceRecord.updateMany({ where: { id: row.id, originalImageUrl: row.value }, data: { originalImageUrl: value } }),
        },
        {
            read: async (cursor) => (await db.practiceRecord.findMany({ ...page(cursor), select: { id: true, answerImageUrl: true } })).map((row) => ({ id: row.id, value: row.answerImageUrl || "" })),
            write: (row, value) => db.practiceRecord.updateMany({ where: { id: row.id, answerImageUrl: row.value }, data: { answerImageUrl: value } }),
        },
        {
            read: async (cursor) => (await db.importTask.findMany({ ...page(cursor), select: { id: true, imageData: true, updatedAt: true } })).map((row) => ({ ...row, value: row.imageData })),
            write: (row, value) => db.importTask.updateMany({ where: { id: row.id, imageData: row.value }, data: { imageData: value, updatedAt: row.updatedAt } }),
        },
        {
            read: async (cursor) => (await db.importBatch.findMany({ ...page(cursor), select: { id: true, imageData: true, updatedAt: true } })).map((row) => ({ ...row, value: row.imageData })),
            write: (row, value) => db.importBatch.updateMany({ where: { id: row.id, imageData: row.value }, data: { imageData: value, updatedAt: row.updatedAt } }),
        },
        {
            draft: true,
            read: async (cursor) => (await db.importBatch.findMany({ ...page(cursor), select: { id: true, draft: true, updatedAt: true } })).map((row) => ({ ...row, value: row.draft || "" })),
            write: (row, value) => db.importBatch.updateMany({ where: { id: row.id, draft: row.value }, data: { draft: value, updatedAt: row.updatedAt } }),
        },
    ];
}

async function visitImages(db: PrismaClient, visit: (source: ImageSource, row: ImageRow) => Promise<void>): Promise<void> {
    for (const source of sources(db)) {
        let cursor: string | undefined;
        for (;;) {
            const rows = await source.read(cursor);
            for (const row of rows) await visit(source, row);
            if (rows.length < 100) break;
            cursor = rows[rows.length - 1].id;
        }
    }
}

/** 可重复执行；文件完整落盘并核验后才替换旧值，失败时保留尚未迁移的 Base64。 */
export async function migrateImages(db: PrismaClient): Promise<{ changed: number }> {
    let changed = 0;
    const migrate = async (value: string) => {
        const reference = await storeImage(value);
        if (isLocalImage(reference)) await readStoredImage(reference);
        return reference;
    };
    await visitImages(db, async (source, row) => {
        if (!row.value) return;
        const next = source.draft ? await mapDraftImages(row.value, migrate) : await migrate(row.value);
        if (next !== row.value) {
            await source.write(row, next);
            changed++;
        }
    });
    return { changed };
}

/** 引用扫描完成且所有引用文件可读后才删除；共享文件有任一引用就保留。默认只预览。 */
export async function pruneImages(db: PrismaClient, remove = false): Promise<{ unreferenced: number; removed: number }> {
    const references = new Set<string>();
    const collect = async (value: string) => {
        if (value.startsWith("local-image:")) {
            const filename = localImagePath(value);
            if (!references.has(filename)) await readStoredImage(value);
            references.add(filename);
        }
        return value;
    };
    await visitImages(db, async (source, row) => {
        if (source.draft && row.value) await mapDraftImages(row.value, collect);
        else await collect(row.value);
    });
    const directory = imageStorageDirectory();
    let folders;
    try { folders = await readdir(directory, { withFileTypes: true }); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { unreferenced: 0, removed: 0 };
        throw error;
    }
    const orphaned: string[] = [];
    for (const folder of folders) {
        if (!folder.isDirectory() || !/^[a-f0-9]{2}$/.test(folder.name)) continue;
        for (const file of await readdir(path.join(directory, folder.name), { withFileTypes: true })) {
            if (!file.isFile() || !/^[a-f0-9]{64}\.(jpg|png|webp|gif)(\.[a-f0-9-]+\.tmp)?$/.test(file.name)) continue;
            const filename = path.join(directory, folder.name, file.name);
            if (!references.has(filename)) orphaned.push(filename);
        }
    }
    if (remove) for (const filename of orphaned) await rm(filename);
    return { unreferenced: orphaned.length, removed: remove ? orphaned.length : 0 };
}
