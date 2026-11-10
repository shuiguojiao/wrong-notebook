import { NextResponse } from "next/server";
import { z } from "zod";
import { gradeAnswer } from "@/lib/practice/grade-answer";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { internalError, notFound, validationError } from "@/lib/api-errors";
import { parseLastPractice } from "@/lib/last-practice";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { consumeAiQuota } from "@/lib/ai-quota";
import { withRecoverableResponse } from "@/lib/recoverable-response";
import { getPracticeVersion } from "@/lib/practice-version";
import { getErrorMessage } from "@/lib/error-message";

import { answerImageSchema } from "@/lib/handwriting/image";

const logger = createLogger('api:practice:grade');

const gradeSchema = z.object({
    errorItemId: z.string().min(1),
    userAnswer: z.string().trim().max(5000).default(""),
    answerImage: answerImageSchema.optional(),
    answerImages: z.array(answerImageSchema).min(1).max(4).optional(),
    mode: z.enum(['original', 'practice']).default('practice'),
    practiceVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    notes: z.string().max(20000).optional(),
    language: z.enum(['zh', 'en']).optional(),
}).transform(data => ({
    ...data,
    answerImages: [...new Set([...(data.answerImage ? [data.answerImage] : []), ...(data.answerImages ?? [])])],
})).refine(data => data.answerImages.length <= 4, { path: ['answerImages'], message: 'At most 4 answer images are allowed' })
    .refine(data => !!data.userAnswer || data.answerImages.length > 0, { path: ['userAnswer'], message: 'An answer is required' })
    .refine((data) => data.mode === 'original' || !!data.practiceVersion, { path: ['practiceVersion'], message: 'Practice version is required' });

/**
 * POST /api/practice/grade
 * 由 AI 对照原题或该错题最近一次生成的举一反三题目判定学生答案。
 * 题目和标准答案取自服务端错题或变式暂存，不信任客户端传入的答案。
 */
async function handlePost(req: Request, { user }: AuthenticatedContext) {
    try {
        const parsed = gradeSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return validationError("Invalid grading request", parsed.error.issues);
        }
        const { errorItemId, userAnswer, language } = parsed.data;

        const item = await prisma.errorItem.findUnique({
            where: { id: errorItemId },
            select: { userId: true, lastPractice: true, questionText: true, ocrText: true, answerText: true, analysis: true },
        });
        if (!item || item.userId !== user.id) return notFound("Item not found");
        const original = parsed.data.mode === 'original';
        const cachedPractice = original ? null : parseLastPractice(item.lastPractice);
        const practice = original ? {
            // 与复习界面一致：没有整理后的题干时退回 OCR 文字
            questionText: item.questionText || item.ocrText || '', answerText: item.answerText ?? '', analysis: item.analysis ?? '',
        } : cachedPractice;
        if (!practice) {
            return notFound("Practice question not found");
        }
        if (original && (!practice.questionText.trim() || !practice.answerText.trim())) {
            return validationError("Original question or answer is missing");
        }
        // 其他标签页可能已生成新题；拒绝旧版本，不能把旧答案交给新题判定。
        if (cachedPractice && parsed.data.practiceVersion !== getPracticeVersion(cachedPractice)) {
            return NextResponse.json({ code: "PRACTICE_CHANGED", message: "Practice question has changed" }, { status: 409 });
        }

        const limited = await consumeAiQuota(user, 'grade');
        if (limited) return limited;

        const result = await gradeAnswer({
            questionText: practice.questionText,
            answerText: practice.answerText,
            analysis: practice.analysis,
            userAnswer: parsed.data.notes?.trim() ? `${userAnswer}\n\n${parsed.data.notes}` : userAnswer,
            answerImages: parsed.data.answerImages,
            language,
        });
        return NextResponse.json(result);
    } catch (error) {
        logger.error({ error }, 'Error grading answer');
        return internalError(getErrorMessage(error) || "Failed to grade answer");
    }
}

/** 耗时 AI 请求：浏览器中断连接后，前端可通过 /api/requests/:id 取回响应 */
export const POST = withRecoverableResponse(withUser(handlePost));
