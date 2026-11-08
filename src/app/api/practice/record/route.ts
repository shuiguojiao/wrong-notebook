import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { internalError, notFound, validationError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { PRACTICE_RESULTS, scheduleMasteryEvaluation } from "@/lib/mastery";
import { MAX_FIGURE_SVG_LENGTH, sanitizeFigureSvg } from "@/lib/figure-svg";
import { getAppTimeZone } from "@/lib/config";
import { getReviewPlan } from "@/lib/review-schedule";

const logger = createLogger('api:practice:record');

const recordSchema = z.object({
    errorItemId: z.string().min(1).optional(),
    result: z.enum(PRACTICE_RESULTS as [string, ...string[]]).optional(),
    isCorrect: z.boolean().nullable().optional(),
    subject: z.string().max(50).nullable().optional(),
    difficulty: z.string().max(20).nullable().optional(),
    questionText: z.string().max(20000).nullable().optional(),
    answerText: z.string().max(20000).nullable().optional(),
    analysis: z.string().max(50000).nullable().optional(),
    figureSvg: z.string().max(MAX_FIGURE_SVG_LENGTH).nullable().optional(),
    userAnswer: z.string().max(5000).nullable().optional(),
    notes: z.string().max(20000).nullable().optional(),
    gradeReason: z.string().max(20000).nullable().optional(),
    // manual 为详情手动录入；review 为重做原题，均不要求附带新题
    source: z.enum(['practice', 'manual', 'review']).optional(),
    includeReviewPlan: z.boolean().optional(),
    takenAt: z.string().datetime({ offset: true }).optional(),
}).refine((data) => data.source !== 'review' || (!!data.errorItemId && ['correct', 'wrong'].includes(data.result ?? '')), {
    message: 'Original review requires an item and a correct/wrong result',
});

async function handlePost(req: Request, { user }: AuthenticatedContext) {
    try {
        const parsed = recordSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return validationError("Invalid practice record", parsed.error.issues);
        }
        const { errorItemId, difficulty, questionText, answerText, analysis } = parsed.data;
        let subject = parsed.data.subject;
        const source = parsed.data.source ?? 'practice';
        const original = source === 'review';
        const figureSvg = sanitizeFigureSvg(parsed.data.figureSvg);
        // 兼容旧客户端只传 isCorrect 的情况
        const result = parsed.data.result
            ?? (parsed.data.isCorrect === true ? 'correct' : parsed.data.isCorrect === false ? 'wrong' : undefined);

        const userId = user.id;

        // 关联原题时校验归属，防止写入他人的错题
        if (errorItemId) {
            const item = await prisma.errorItem.findUnique({
                where: { id: errorItemId },
                select: { userId: true, subject: { select: { name: true } } },
            });
            if (!item || item.userId !== userId) {
                return notFound("Item not found");
            }
            subject ??= item.subject?.name ?? null;
        }

        const isCorrect = result ? result === 'correct' : parsed.data.isCorrect;

        // 会话保存与计划读取在同一事务中完成，避免保存后查询失败导致客户端重试并重复记账。
        const saveRecord = async (db: Prisma.TransactionClient) => {
            const record = await db.practiceRecord.create({
                data: {
                    userId,
                    subject,
                    difficulty: original ? null : difficulty,
                    isCorrect,
                    ...(errorItemId ? {
                        errorItemId,
                        result,
                        questionText: original ? null : questionText,
                        answerText: original ? null : answerText,
                        analysis: original ? null : analysis,
                        figureSvg: original ? null : figureSvg,
                        wrongAnswerText: parsed.data.userAnswer ?? null,
                        notes: parsed.data.notes ?? null,
                        gradeReason: parsed.data.gradeReason ?? null,
                        source,
                    } : {}),
                    ...(parsed.data.takenAt ? { createdAt: new Date(parsed.data.takenAt) } : {}),
                },
            });

            if (parsed.data.includeReviewPlan && errorItemId) {
                const item = await db.errorItem.findUniqueOrThrow({
                    where: { id: errorItemId },
                    select: { createdAt: true, practiceRecords: { select: { result: true, createdAt: true } } },
                });
                return { ...record, reviewPlan: getReviewPlan(item.createdAt, item.practiceRecords, getAppTimeZone()) };
            }
            return record;
        };
        const record = parsed.data.includeReviewPlan ? await prisma.$transaction(saveRecord) : await saveRecord(prisma);
        if (errorItemId && result) scheduleMasteryEvaluation([errorItemId]);

        return NextResponse.json(record);
    } catch (error) {
        logger.error({ error }, 'Error saving practice record');
        return internalError("Failed to save record");
    }
}

export const POST = withUser(handlePost);
