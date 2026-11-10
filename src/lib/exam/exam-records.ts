import "server-only";

import type { Prisma } from "@prisma/client";
import { syncReviewState } from "@/lib/review-state";

interface RecordQuestion {
    id: string;
    errorItemId: string | null;
    questionText: string | null;
    answerText: string | null;
    analysis: string | null;
    figureSvg: string | null;
    errorItem: { subject: { name: string } | null } | null;
}

/** 两种录入入口共用学科、难度与题目快照规则。 */
export function examRecordData(userId: string, paper: { mode: string; difficulty: string }, question: RecordQuestion, result: string, takenAt: Date) {
    return {
        userId,
        errorItemId: question.errorItemId,
        examQuestionId: question.id,
        source: 'exam',
        result,
        isCorrect: result === 'correct',
        createdAt: takenAt,
        difficulty: paper.mode === 'original' ? null : paper.difficulty,
        subject: question.errorItem?.subject?.name ?? null,
        questionText: question.questionText,
        answerText: question.answerText,
        analysis: question.analysis,
        figureSvg: question.figureSvg,
    };
}

export async function syncExamResults(tx: Prisma.TransactionClient, paperId: string, affected: Set<string>): Promise<void> {
    for (const id of affected) await syncReviewState(tx, id);
    if (affected.size > 0) {
        await tx.examPaper.update({ where: { id: paperId }, data: { resultsRecordedAt: new Date() } });
    }
}
