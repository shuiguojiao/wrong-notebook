import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { internalError, badRequest } from "@/lib/api-errors";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "@/lib/constants/pagination";
import { reviewDueQuerySchema } from "@/lib/schemas/practice";
import { createLogger } from "@/lib/logger";
import { getMasteryThreshold } from "@/lib/mastery";
import { PRACTICE_RECORD_COUNT, masteryStatusOf } from "@/lib/mastery-status";
import { prisma } from "@/lib/prisma";
import { reviewQuestionPreview, reviewQuestionPreviewMarkdown } from '@/lib/question/review-preview';
import { getReviewQueue } from "@/lib/review-due";

const logger = createLogger('api:review:due');

/** 今日待复习：按分钟额度、优先级及科目轮流出题 */
async function handleGet(req: Request, { user }: AuthenticatedContext) {
    const { searchParams } = new URL(req.url);
    const parsedQuery = reviewDueQuerySchema.safeParse({
        subjectId: searchParams.get("subjectId") ?? undefined,
        page: searchParams.get("page") ?? undefined,
        pageSize: searchParams.get("pageSize") ?? undefined,
        format: searchParams.get("format") ?? undefined,
        mode: searchParams.get("mode") ?? undefined,
    });
    if (!parsedQuery.success) {
        return badRequest("Invalid query parameters");
    }
    const { subjectId } = parsedQuery.data;
    const page = Math.max(1, parsedQuery.data.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, parsedQuery.data.pageSize ?? DEFAULT_PAGE_SIZE));

    try {
        const { entries: due, ...budget } = await getReviewQueue(user.id, subjectId, parsedQuery.data.mode);
        if (parsedQuery.data.format === 'ids' || parsedQuery.data.format === 'overview') {
            const snapshot = due;
            const questions = await prisma.errorItem.findMany({
                where: { userId: user.id, id: { in: snapshot.map(({ id }) => id) } },
                select: { id: true, questionText: true, ocrText: true, subjectId: true, subject: { select: { name: true } } },
            });
            const previews = new Map(questions.map(item => [item.id, {
                questionPreview: reviewQuestionPreview(item.questionText || item.ocrText),
                questionPreviewMarkdown: reviewQuestionPreviewMarkdown(item.questionText || item.ocrText),
                subjectId: item.subjectId, subjectName: item.subject?.name ?? null,
            }]));
            return NextResponse.json({ ...budget, items: snapshot.map(({ id, plan, estimatedSec }) => ({
                id, estimatedSec, nextReviewAt: plan.nextReviewAt, ...previews.get(id),
            })) });
        }
        const masteryThreshold = await getMasteryThreshold(user.id);

        const pageEntries = due.slice((page - 1) * pageSize, page * pageSize);
        const items = await prisma.errorItem.findMany({
            where: { id: { in: pageEntries.map(({ id }) => id) } },
            include: {
                subject: true,
                tags: true,
                _count: PRACTICE_RECORD_COUNT,
            },
        });
        const itemById = new Map(items.map((item) => [item.id, item]));

        return NextResponse.json({
            items: pageEntries.flatMap(({ id, plan }) => {
                const found = itemById.get(id);
                if (!found) return [];
                const { _count, ...item } = found;
                return [{
                    ...item,
                    masteryStatus: masteryStatusOf(_count.practiceRecords, item.masteryProbability, masteryThreshold),
                    reviewStage: plan.stage,
                    nextReviewAt: plan.nextReviewAt,
                }];
            }),
            ...budget,
            total: due.length,
            page,
            pageSize,
            totalPages: Math.ceil(due.length / pageSize),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to list due reviews');
        return internalError("Failed to list due reviews");
    }
}

export const GET = withUser(handleGet);
