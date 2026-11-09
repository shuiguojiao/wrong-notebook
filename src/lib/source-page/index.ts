import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { AgentInputError } from "@/lib/agent/errors";
import { downloadImage } from "@/lib/agent/image";
import type { agentSourceImageSchema, agentSourceSchema } from "@/lib/agent/schema";
import { getErrorMessage } from "@/lib/error-message";
import { runSerializedTransaction } from "@/lib/db-write-queue";
import { readStoredImage, storeImage } from "@/lib/image-storage";
import { prisma } from "@/lib/prisma";
import { decodeSourceImage, inspectSourceImage } from "./codec";
import { cropSourceImage } from "./crop";
import { SOURCE_PAGE_MAX_BYTES } from "./limits";

type SourceMetadata = { fileName?: string; pageNumber?: number; origin?: string };
type SourceInput = z.infer<typeof agentSourceSchema>;

export async function sourceImageBytes(input: z.infer<typeof agentSourceImageSchema>) {
    try {
        if ("url" in input) return await downloadImage(input.url, SOURCE_PAGE_MAX_BYTES);
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) throw new AgentInputError("AGENT_SOURCE_INVALID");
        if (input.base64.length > Math.ceil(SOURCE_PAGE_MAX_BYTES / 3) * 4) throw new AgentInputError("AGENT_SOURCE_TOO_LARGE", 413);
        const bytes = Buffer.from(input.base64, "base64");
        if (bytes.toString("base64").replace(/=+$/, "") !== input.base64.replace(/=+$/, "")) throw new AgentInputError("AGENT_SOURCE_INVALID");
        return { bytes, mimeType: input.mimeType };
    } catch (error) {
        if (error instanceof AgentInputError) throw error;
        if (getErrorMessage(error) === "AGENT_IMAGE_TOO_LARGE") throw new AgentInputError("AGENT_SOURCE_TOO_LARGE", 413);
        throw new AgentInputError("AGENT_SOURCE_INVALID");
    }
}

/** 唯一键与串行事务共同处理重试、并发去重；文件与题图共用存储。 */
export async function saveSourcePage(userId: string, bytes: Buffer, mimeType: string, metadata: SourceMetadata = {}) {
    const dimensions = inspectSourceImage(bytes, mimeType);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const key = { userId_sha256: { userId, sha256 } };
    const existing = await prisma.sourcePage.findUnique({ where: key });
    if (existing) return { page: existing, reused: true };
    // 新图片完整解码一次，损坏的文件不能进入出处表。
    decodeSourceImage(bytes, mimeType);
    const imageUrl = await storeImage(`data:${mimeType};base64,${bytes.toString("base64")}`);
    return runSerializedTransaction(async (tx) => {
        const found = await tx.sourcePage.findUnique({ where: key });
        if (found) return { page: found, reused: true };
        const page = await tx.sourcePage.create({ data: {
            userId, sha256, imageUrl, width: dimensions.width, height: dimensions.height,
            origin: metadata.origin ?? "agent", fileName: metadata.fileName, pageNumber: metadata.pageNumber,
        } });
        return { page, reused: false };
    });
}

/** 先按用户读取整页，输出图落盘后交给题目事务写入引用。 */
export async function prepareAgentSource(userId: string, source: SourceInput) {
    let page;
    if (source.page) {
        const { bytes, mimeType } = await sourceImageBytes(source.page);
        page = (await saveSourcePage(userId, bytes, mimeType, source)).page;
    } else {
        page = await prisma.sourcePage.findFirst({ where: { id: source.pageId, userId } });
    }
    if (!page) throw new AgentInputError("AGENT_SOURCE_PAGE_NOT_FOUND", 404);
    const stored = await readStoredImage(page.imageUrl);
    if (!stored) throw new AgentInputError("AGENT_SOURCE_INVALID");
    const cropped = cropSourceImage(stored.bytes, stored.mimeType, source.regions);
    const imageUrl = await storeImage(`data:image/jpeg;base64,${cropped.toString("base64")}`);
    return { pageId: page.id, imageUrl, regions: source.regions, fileName: source.fileName, pageNumber: source.pageNumber };
}

export type PreparedAgentSource = Awaited<ReturnType<typeof prepareAgentSource>>;

/** 事务内再次验证归属，区域和题图一起替换，避免出现图与框不一致。 */
export async function replaceQuestionSource(tx: Prisma.TransactionClient, userId: string, errorItemId: string, source: PreparedAgentSource) {
    const page = await tx.sourcePage.findFirst({ where: { id: source.pageId, userId } });
    if (!page) throw new AgentInputError("AGENT_SOURCE_PAGE_NOT_FOUND", 404);
    // 出处页由多题共享，只补齐缺失字段，保留已有文件名和页码。
    const metadata: Prisma.SourcePageUpdateInput = {};
    if (!page.fileName && source.fileName !== undefined) metadata.fileName = source.fileName;
    if (page.pageNumber === null && source.pageNumber !== undefined) metadata.pageNumber = source.pageNumber;
    if (Object.keys(metadata).length) await tx.sourcePage.update({ where: { id: page.id }, data: metadata });
    await tx.questionRegion.deleteMany({ where: { errorItemId } });
    await tx.questionRegion.createMany({ data: source.regions.map((region, order) => ({ ...region, order, errorItemId, pageId: page.id })) });
    await tx.errorItem.update({ where: { id: errorItemId }, data: { originalImageUrl: source.imageUrl } });
}
