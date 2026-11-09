import { NextResponse } from "next/server";
import { z } from "zod";
import { readStoredImage, storeImage } from "@/lib/image-storage";
import { printImageUrl } from "@/lib/error-list/error-list-select";
import { prisma } from "@/lib/prisma";
import { notFound, badRequest, internalError, createErrorResponse } from "@/lib/api-errors";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { createLogger } from "@/lib/logger";
import { scheduleIntegrityCheck } from "@/lib/question/integrity-queue";
import { checkSavedQuestion } from "@/lib/question/check-store";
import { AgentInputError } from "@/lib/agent/errors";
import { resolveQuestionCheck } from "@/lib/question/resolve-check";
import { getErrorMessage } from "@/lib/error-message";

const logger = createLogger('api:error-items:image');

/** 与新建错题时的上限一致 */
const MAX_IMAGE_LENGTH = 20 * 1024 * 1024;

const bodySchema = z.object({
    expectedUpdatedAt: z.iso.datetime().optional(),
    durationMs: z.number().int().min(0).max(3_600_000).optional(),
    imageDataUrl: z.string()
        .max(MAX_IMAGE_LENGTH)
        .regex(/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/error-items/:id/image
 * 以二进制图片输出原题图片，供打印预览按需懒加载，避免列表接口携带大段 base64。
 * 链接带 `?v=<更新时间>`，原图替换后链接随之变化，因此可长期缓存。
 */
export const GET = withUser(async (req: Request, { user, params }: RouteContext & AuthenticatedContext) => {
    const { id } = await params;

    try {
        const search = new URL(req.url).searchParams;
        const recordId = search.get("record");
        const sourcePageId = search.get("sourcePage");
        const item = sourcePageId
            ? await prisma.sourcePage.findFirst({
                where: { id: sourcePageId, userId: user.id, regions: { some: { errorItemId: id, errorItem: { userId: user.id } } } },
                select: { userId: true, imageUrl: true },
            })
            : recordId
            ? await prisma.practiceRecord.findFirst({ where: { id: recordId, errorItemId: id, userId: user.id }, select: { userId: true, originalImageUrl: true, answerImageUrl: true } })
            : await prisma.errorItem.findUnique({ where: { id }, select: { userId: true, originalImageUrl: true } });
        if (!item || item.userId !== user.id) {
            return notFound("Item not found");
        }

        const answer = search.get("field") === "answer";
        const value = "imageUrl" in item ? item.imageUrl
            : answer ? ("answerImageUrl" in item ? item.answerImageUrl : null) : item.originalImageUrl;
        const image = await readStoredImage(typeof value === "string" ? value : "");
        if (!image) {
            return notFound("Image not found");
        }

        const body = image.bytes;
        return new Response(new Uint8Array(body), {
            headers: {
                "Content-Type": image.mimeType,
                "Content-Length": String(body.length),
                "Cache-Control": "private, max-age=31536000, immutable",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" || getErrorMessage(error) === "IMAGE_CHECKSUM_MISMATCH") {
            logger.warn({ code: (error as NodeJS.ErrnoException).code || "IMAGE_CHECKSUM_MISMATCH" }, '原题图片缺失或损坏');
            return notFound("Image not found");
        }
        logger.error({ error }, 'Error reading original image');
        return internalError("Failed to read image");
    }
});

/**
 * PUT /api/error-items/:id/image
 * 替换（或补充）原题图片；题目文字、配图等其他内容不变
 */
export const PUT = withUser(async (req: Request, { user, params }: RouteContext & AuthenticatedContext) => {
    const { id } = await params;

    try {
        const parsed = bodySchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return badRequest("INVALID_IMAGE");
        }

        const item = await prisma.errorItem.findUnique({ where: { id }, select: { userId: true } });
        if (!item || item.userId !== user.id) {
            return notFound("Item not found");
        }

        const reference = await storeImage(parsed.data.imageDataUrl);
        if (parsed.data.expectedUpdatedAt) {
            const result = await resolveQuestionCheck(user, id, { action: "replace", updatedAt: parsed.data.expectedUpdatedAt, imageUrl: reference, durationMs: parsed.data.durationMs });
            if (!("updatedAt" in result)) return internalError();
            return NextResponse.json({ originalImageUrl: printImageUrl(id, result.updatedAt) });
        }
        const updated = await prisma.errorItem.update({ where: { id }, data: { originalImageUrl: reference } });
        await checkSavedQuestion(id);
        scheduleIntegrityCheck(id);
        logger.info({ errorItemId: id, imageLength: parsed.data.imageDataUrl.length }, 'Original image replaced');
        return NextResponse.json({ originalImageUrl: printImageUrl(id, updated.updatedAt) });
    } catch (error) {
        if (error instanceof AgentInputError) return createErrorResponse(error.message, error.status);
        logger.error({ error }, 'Error replacing original image');
        return internalError("Failed to replace image");
    }
});
