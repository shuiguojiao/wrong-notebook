import "server-only";

import { storeImage, mapPageImages } from "@/lib/image-storage";
import { createLogger } from "@/lib/logger";
import type { ImportContext } from "./types";

const logger = createLogger("backup:exam-attempts");

/** 试卷与题目映射建立后恢复作答，练习记录随后映射到新作答 ID。 */
export async function importExamAttempts(ctx: ImportContext): Promise<void> {
    const { tx, user, importAll, normalized, examPaperIdMap, examQuestionIdMap, examAttemptIdMap } = ctx;
    for (const raw of normalized.data.examAttempts ?? []) {
        const paperId = examPaperIdMap.get(raw.paperId);
        const userId = importAll ? raw.userId : user.id;
        if (!paperId || !await tx.examPaper.findFirst({ where: { id: paperId, userId }, select: { id: true } })) continue;
        const existing = await tx.examAttempt.findFirst({ where: {
            paperId, userId, kind: raw.kind, startedAt: new Date(raw.startedAt), createdAt: new Date(raw.createdAt),
        }, select: { id: true } });
        if (existing) {
            examAttemptIdMap.set(raw.id, existing.id);
            continue;
        }
        if (raw.status !== 'done' && await tx.examAttempt.findFirst({ where: { paperId, userId, status: { not: 'done' } }, select: { id: true } })) {
            logger.warn({ userId, paperId, attemptId: raw.id }, '跳过与现有未完成作答冲突的备份作答');
            continue;
        }
        const created = await tx.examAttempt.create({ data: {
            userId, paperId, kind: raw.kind, status: raw.status,
            startedAt: new Date(raw.startedAt), submittedAt: raw.submittedAt ? new Date(raw.submittedAt) : null,
            confirmedAt: raw.confirmedAt ? new Date(raw.confirmedAt) : null,
            createdAt: new Date(raw.createdAt), updatedAt: new Date(raw.updatedAt), durationSec: raw.durationSec,
            pageImages: raw.pageImages ? await mapPageImages(raw.pageImages, async image => image ? storeImage(image) : '') : null,
        } });
        examAttemptIdMap.set(raw.id, created.id);
        for (const answer of raw.answers) {
            const examQuestionId = examQuestionIdMap.get(answer.examQuestionId);
            if (!examQuestionId) continue;
            await tx.examAttemptAnswer.create({ data: {
                attemptId: created.id, examQuestionId,
                answerText: answer.answerText, answerImageUrl: answer.answerImageUrl ? await storeImage(answer.answerImageUrl) : null,
                gradingImages: answer.gradingImages ? await mapPageImages(answer.gradingImages, async image => image ? storeImage(image) : '') : null,
                gradingRetries: answer.gradingRetries,
                flagged: answer.flagged, pageIndex: answer.pageIndex, region: answer.region,
                recognizedAnswer: answer.recognizedAnswer, handMark: answer.handMark,
                aiResult: answer.aiResult, aiReason: answer.aiReason, finalResult: answer.finalResult,
                updatedAt: new Date(answer.updatedAt),
            } });
        }
    }
}
