import "server-only";

import type { ImportTask, Prisma } from "@prisma/client";
import { z } from "zod";
import { getErrorMessage } from "@/lib/error-message";
import { readStoredImage } from "@/lib/image-storage";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { replaceQuestionSource, saveSourcePage } from "@/lib/source-page";
import { sourceRegionsSchema } from "@/lib/source-page/layout";

export const importSourceMetadataSchema = z.object({
    origin: z.enum(["upload", "pdf"]),
    fileName: z.string().max(300).optional(),
    pageNumber: z.number().int().min(1).max(100_000).optional(),
});

const logger = createLogger("import-source-page");
const fullPage = { x: 0, y: 0, width: 1, height: 1 };
const draftSourceSchema = z.object({
    items: z.array(z.object({ key: z.string(), regions: sourceRegionsSchema.or(z.tuple([])) })),
});

/**
 * 首题保存前复用整页文件；失败留下的未引用出处页由现有清理逻辑回收。
 * 出处只用于追溯，任何异常都只记日志并跳过，不能让题目入库失败。
 */
export async function prepareImportTaskSource(task: ImportTask) {
    try {
        return await loadImportTaskSource(task);
    } catch (error) {
        logger.warn({ taskId: task.id, error: getErrorMessage(error) }, "保存出处页失败，题目照常入库");
        return null;
    }
}

async function loadImportTaskSource(task: ImportTask) {
    const batch = task.batchId
        ? await prisma.importBatch.findFirst({ where: { id: task.batchId, userId: task.userId } })
        : null;
    // 文字、表格和 Word 草稿中的附件并非整页出处，不据此建立关联。
    if (task.batchId && batch?.source !== "image") return null;
    const image = await readStoredImage(batch?.imageData ?? task.imageData);
    if (!image) throw new Error("IMPORT_SOURCE_IMAGE_MISSING");
    const info = batch?.imageInfo ? JSON.parse(batch.imageInfo) as { sourcePage?: unknown } : null;
    const metadata = importSourceMetadataSchema.parse(info?.sourcePage ?? { origin: "upload" });
    const { page } = await saveSourcePage(task.userId, image.bytes, image.mimeType, metadata);
    return { pageId: page.id, ...metadata };
}

/** 区域与错题、任务状态同事务写入，使用入库时的草稿并复用服务端区域校验。 */
export async function writeImportTaskSource(
    tx: Prisma.TransactionClient,
    task: ImportTask,
    errorItemId: string,
    source: NonNullable<Awaited<ReturnType<typeof prepareImportTaskSource>>>,
) {
    let regions = [fullPage];
    if (task.batchId) {
        const batch = await tx.importBatch.findFirst({ where: { id: task.batchId, userId: task.userId } });
        let draft: z.infer<typeof draftSourceSchema> | null = null;
        try { draft = draftSourceSchema.parse(JSON.parse(batch?.draft ?? "null")); } catch { draft = null; }
        const item = draft?.items.find((entry) => entry.key === task.batchItemKey);
        // 扫描 PDF 无区域时保留整页，照片分题则必须具有有效框选。
        const parsed = item && sourceRegionsSchema.safeParse(item.regions.length || source.origin !== "pdf" ? item.regions : [fullPage]);
        if (!parsed?.success) {
            // 区域缺失或越界时不写出处，题目照常入库。
            logger.warn({ taskId: task.id, errorItemId }, "导入草稿中的题目区域无效，跳过出处");
            return;
        }
        regions = parsed.data;
    }
    await replaceQuestionSource(tx, task.userId, errorItemId, {
        ...source, regions, imageUrl: task.imageData, fileName: source.fileName, pageNumber: source.pageNumber,
    });
}
