import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** 数据库只保存此标识；实际路径由服务端计算，客户端不能指定磁盘路径。 */
export const LOCAL_IMAGE_PATTERN = /^local-image:([a-f0-9]{64})\.(jpg|png|webp|gif)$/;
const DATA_IMAGE_PATTERN = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/]+=*)$/;
const IMAGE_FIELDS = new Set(["originalImageUrl", "imageData", "image"]);

export function imageStorageDirectory(): string {
    if (process.env.IMAGE_STORAGE_DIR) return path.resolve(process.env.IMAGE_STORAGE_DIR);
    const databasePath = (process.env.DATABASE_URL || "file:./dev.db").replace(/^file:/, "").split("?")[0];
    return path.join(path.dirname(path.resolve(process.cwd(), "prisma", databasePath)), "images");
}

export function isLocalImage(value: string): boolean {
    return LOCAL_IMAGE_PATTERN.test(value);
}

export function localImagePath(reference: string): string {
    const match = reference.match(LOCAL_IMAGE_PATTERN);
    if (!match) throw new Error("INVALID_LOCAL_IMAGE");
    return path.join(imageStorageDirectory(), match[1].slice(0, 2), `${match[1]}.${match[2]}`);
}

function digest(bytes: Buffer): string {
    return createHash("sha256").update(bytes).digest("hex");
}

/** 先原子落盘再写数据库；相同内容共用文件，失败事务留下的文件由离线清理命令处理。 */
export async function storeImage(value: string): Promise<string> {
    if (value.startsWith("local-image:")) {
        await readStoredImage(value);
        return value;
    }
    const match = value.match(DATA_IMAGE_PATTERN);
    if (!match) return value;
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length) throw new Error("INVALID_IMAGE_DATA");
    const extension = match[1] === "image/jpeg" || match[1] === "image/jpg" ? "jpg" : match[1].slice(6);
    const reference = `local-image:${digest(bytes)}.${extension}`;
    const filename = localImagePath(reference);
    await mkdir(path.dirname(filename), { recursive: true });
    // 已有文件也校验内容，避免把损坏的文件引用写入数据库。
    try {
        await readStoredImage(reference);
        return reference;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
        await rename(temporary, filename);
    } finally {
        await rm(temporary, { force: true });
    }
    return reference;
}

/** 仅在调用方已确认用户拥有题目、任务或记录后读取。 */
export async function readStoredImage(value: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
    if (value.startsWith("local-image:")) {
        const filename = localImagePath(value);
        const bytes = await readFile(filename);
        const match = value.match(LOCAL_IMAGE_PATTERN)!;
        if (digest(bytes) !== match[1]) throw new Error("IMAGE_CHECKSUM_MISMATCH");
        return { bytes, mimeType: `image/${match[2] === "jpg" ? "jpeg" : match[2]}` };
    }
    const match = value.match(DATA_IMAGE_PATTERN);
    return match ? { bytes: Buffer.from(match[2], "base64"), mimeType: match[1] } : null;
}

/** AI 输入、草稿详情和可移植备份仍使用 data URL；普通原图接口直接返回二进制。 */
export async function imageDataUrl(value: string): Promise<string> {
    if (!value.startsWith("local-image:")) return value;
    const image = await readStoredImage(value);
    if (!image) throw new Error("INVALID_LOCAL_IMAGE");
    return `data:${image.mimeType};base64,${image.bytes.toString("base64")}`;
}

/** 只处理约定的图片字段，不改题干、笔记等普通文本；日期对象保持原样。 */
export async function mapImageFields<T>(value: T, transform: (image: string) => Promise<string>): Promise<T> {
    if (Array.isArray(value)) {
        const result = [];
        for (const entry of value) result.push(await mapImageFields(entry, transform));
        return result as T;
    }
    if (!value || typeof value !== "object" || value instanceof Date) return value;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (IMAGE_FIELDS.has(key) && typeof entry === "string") result[key] = await transform(entry);
        else if (key === "draft" && typeof entry === "string") result[key] = await mapDraftImages(entry, transform);
        else result[key] = await mapImageFields(entry, transform);
    }
    return result as T;
}

export async function mapDraftImages(raw: string, transform: (image: string) => Promise<string>): Promise<string> {
    let draft: unknown;
    try { draft = JSON.parse(raw); } catch { return raw; }
    return JSON.stringify(await mapImageFields(draft, transform));
}

/** 备份和公开保存接口不能接收本机引用，否则可能借此关联其他用户的图片。 */
export async function portableImage(value: string): Promise<string> {
    if (value.startsWith("local-image:")) throw new Error("LOCAL_IMAGE_REFERENCE_NOT_PORTABLE");
    return value;
}
