import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { getAIService } from "@/lib/ai";
import { badRequest, notFound, internalError, taskAlreadyRunning } from "@/lib/api-errors";
import { generatePracticeSchema } from "@/lib/schemas/practice";
import { createLogger } from "@/lib/logger";
import { describeQuestion, findRunningTask, reserveBackgroundTask, runReservedTask } from "@/lib/background-tasks";
import { serializeWrite } from "@/lib/db-write-queue";
import { parseLastPractice, serializeLastPractice } from "@/lib/last-practice";
import type { LastPractice } from "@/lib/last-practice";
import { consumeAiQuota } from "@/lib/ai-quota";
import { withRecoverableResponse } from "@/lib/recoverable-response";
import { getPracticeVersion } from "@/lib/practice-version";
import { createReviewVariantToken, MAX_VARIANT_TOKEN_LENGTH } from "@/lib/practice/review-variant-token";
import { reviewVariantDifficulty } from "@/lib/review-variant";
import { getErrorMessage } from "@/lib/error-message";

const logger = createLogger('api:practice:generate');

/**
 * GET /api/practice/generate?errorItemId=xxx
 * 读取该错题最近一次生成的举一反三题目，没有时返回 { practice: null }
 */
async function handleGet(req: Request, { user }: AuthenticatedContext) {
    try {
        const errorItemId = new URL(req.url).searchParams.get("errorItemId");
        if (!errorItemId) {
            return notFound("Item not found");
        }

        const item = await prisma.errorItem.findUnique({
            where: { id: errorItemId },
            select: { userId: true, lastPractice: true }
        });
        if (!item || item.userId !== user.id) {
            return notFound("Item not found");
        }

        const practice = parseLastPractice(item.lastPractice);
        return NextResponse.json({ practice: practice ? { ...practice, practiceVersion: getPracticeVersion(practice) } : null });
    } catch (error) {
        logger.error({ error }, 'Error loading last practice');
        return internalError("Failed to load last practice question");
    }
}

export const GET = withUser(handleGet);

async function handlePostInner(req: Request, { user }: AuthenticatedContext) {
    try {
        const parsed = generatePracticeSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return badRequest("errorItemId is required");
        }
        const { errorItemId, language, mode } = parsed.data;
        const variant = mode === 'variant_review';

        const errorItemWithSubject = await prisma.errorItem.findUnique({
            where: { id: errorItemId },
            include: { subject: true }
        });

        // 只能基于自己的错题生成，否则等于间接读取他人题目
        if (!errorItemWithSubject || errorItemWithSubject.userId !== user.id) {
            return notFound("Item not found");
        }
        if (variant && !errorItemWithSubject.answerText?.trim()) return badRequest("Original answer is missing");
        const difficulty = variant ? reviewVariantDifficulty(errorItemWithSubject.difficultyStars) : parsed.data.difficulty ?? 'medium';

        let tags: string[] = [];
        try {
            tags = JSON.parse(errorItemWithSubject.knowledgePoints || "[]");
        } catch {
            tags = [];
        }

        // 普通加练和变式复习各自防止重复生成。
        const target = `error-item:${errorItemId}:${mode}`;
        const handle = reserveBackgroundTask({
            userId: user.id,
            kind: mode,
            subject: describeQuestion(errorItemWithSubject),
            link: `/error-items/${errorItemId}`,
            target,
        });
        if (!handle) {
            return taskAlreadyRunning(findRunningTask(user.id, target) ?? { id: '', kind: 'practice', startedAt: '', target });
        }

        const limited = await serializeWrite(() => variant && req.signal.aborted
            ? Promise.resolve(badRequest("Variant request was cancelled"))
            : consumeAiQuota(user, 'practice'));
        if (limited) {
            handle.cancel();
            return limited;
        }
        if (variant && req.signal.aborted) {
            handle.cancel();
            return badRequest("Variant request was cancelled");
        }

        const similarQuestion = await runReservedTask(handle, () =>
            getAIService().generateSimilarQuestion(
                errorItemWithSubject.questionText || (variant ? errorItemWithSubject.ocrText : '') || "",
                tags,
                language,
                difficulty,
                errorItemWithSubject.gradeSemester,
                errorItemWithSubject.figureSvg
            )
        );

        // Inject the subject from the database with type safety
        const validSubjects = ["数学", "物理", "化学", "生物", "英语", "语文", "历史", "地理", "政治", "其他"] as const;
        const subjectName = errorItemWithSubject.subject?.name || "其他";
        similarQuestion.subject = (validSubjects as readonly string[]).includes(subjectName) ? subjectName as typeof validSubjects[number] : "其他";

        const lastPractice: LastPractice = {
            questionText: similarQuestion.questionText,
            answerText: similarQuestion.answerText,
            analysis: similarQuestion.analysis,
            subject: similarQuestion.subject,
            figureSvg: similarQuestion.figureSvg ?? null,
            difficulty,
            generatedAt: new Date().toISOString(),
        };
        if (variant) {
            if (!lastPractice.questionText.trim() || !lastPractice.answerText.trim()) return internalError("Variant question or answer is empty");
            const variantToken = createReviewVariantToken(lastPractice, user.id, errorItemId);
            if (variantToken.length > MAX_VARIANT_TOKEN_LENGTH) return internalError("Variant question is too large");
            return NextResponse.json({ ...lastPractice, variantToken });
        }

        // 暂存本次普通加练，下次进入练习页时直接显示。
        try {
            await prisma.errorItem.update({
                where: { id: errorItemId },
                data: { lastPractice: serializeLastPractice(lastPractice) }
            });
        } catch (error) {
            logger.warn({ error }, 'Failed to cache last practice question');
        }

        return NextResponse.json({ ...similarQuestion, difficulty: lastPractice.difficulty, generatedAt: lastPractice.generatedAt, practiceVersion: getPracticeVersion(lastPractice) });
    } catch (error) {
        logger.error({ error }, 'Error generating practice');
        const errorMessage = getErrorMessage(error) || "Failed to generate practice question";
        return internalError(errorMessage);
    }
}

/** 耗时 AI 请求：浏览器中断连接后，前端可通过 /api/requests/:id 取回响应 */
export const POST = withRecoverableResponse(withUser(handlePostInner));
