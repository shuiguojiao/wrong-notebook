import "server-only";

import type { Prisma } from "@prisma/client";
import { groupExamQuestions } from "@/lib/exam/exam-sections";
import { matchAnswer } from "@/lib/answer-match";
import { storeImage } from "@/lib/image-storage";
import { removeUnreferencedImages } from "@/lib/image-maintenance";
import { prisma } from "@/lib/prisma";
import { examRecordData, syncExamResults } from "./exam-records";
import { attemptKindSchema, confirmAttemptSchema, manualTakenAtSchema, finalResultSchema, saveAnswerSchema, submitAttemptSchema } from "./exam-attempt-schema";
import type { AttemptKind, ConfirmAttemptInput, FinalResult, SaveAnswerInput } from "./exam-attempt-schema";

const attemptInclude = {
    answers: true,
    paper: { include: { questions: { orderBy: { order: 'asc' as const }, include: { errorItem: { select: { questionType: true, subject: { select: { name: true } } } } } } } },
} satisfies Prisma.ExamAttemptInclude;

/** 首先取得 SQLite 写锁，同一作答的保存、交卷、确认和删除串行执行。 */
async function lockAttempt(tx: Prisma.TransactionClient, paperId: string, userId: string, attemptId: string, statuses: string[]) {
    const changed = await tx.examAttempt.updateMany({ where: { id: attemptId, paperId, userId, paper: { userId } }, data: { updatedAt: new Date() } });
    if (!changed.count) throw new Error('EXAM_ATTEMPT_NOT_FOUND');
    const attempt = await tx.examAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: attemptInclude });
    if (!statuses.includes(attempt.status)) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
    return attempt;
}

export async function startAttempt(paperId: string, userId: string, kind: AttemptKind) {
    attemptKindSchema.parse(kind);
    return prisma.$transaction(async tx => {
        // 先锁试卷，避免两个并发请求各自建立未完成作答。
        const count = await tx.$executeRaw`UPDATE "ExamPaper" SET "id" = "id" WHERE "id" = ${paperId} AND "userId" = ${userId}`;
        if (!count) throw new Error('EXAM_NOT_FOUND');
        const existing = await tx.examAttempt.findFirst({ where: { paperId, userId, status: { not: 'done' } }, orderBy: { createdAt: 'asc' } });
        if (existing) return existing;
        return tx.examAttempt.create({ data: { paperId, userId, kind, status: kind === 'manual' ? 'reviewing' : 'answering' } });
    });
}

export async function getAttempt(paperId: string, userId: string, attemptId: string) {
    const attempt = await prisma.examAttempt.findFirst({ where: { id: attemptId, paperId, userId, paper: { userId } }, include: attemptInclude });
    if (!attempt) throw new Error('EXAM_ATTEMPT_NOT_FOUND');
    const chronology = await prisma.examAttempt.findMany({ where: { paperId, userId }, orderBy: [{ startedAt: 'asc' }, { id: 'asc' }], select: { id: true } });
    const { paper, ...rest } = attempt;
    const reveal = attempt.status === 'reviewing' || attempt.status === 'done';
    // 题号与试卷详情、打印页共用排序；这里只取编号，不使用大题标题。
    const numbered = paper.groupByType
        ? groupExamQuestions(paper.questions.map(question => ({ ...question, errorItemQuestionType: question.errorItem?.questionType })), 'zh').flatMap(section => section.items)
        : paper.questions.map((question, index) => ({ question, displayNumber: index + 1 }));
    const numbers = new Map(numbered.map(item => [item.question.id, item.displayNumber]));
    return {
        ...rest,
        number: chronology.findIndex(item => item.id === attemptId) + 1,
        paper: {
            id: paper.id, title: paper.title,
            questions: paper.questions.map(question => ({
                id: question.id, order: question.order, displayNumber: numbers.get(question.id), questionText: question.questionText,
                score: question.score, errorItemId: question.errorItemId, hasOriginal: Boolean(question.errorItemId),
                figureSvg: question.figureSvg, figureScale: question.figureScale, figureAlign: question.figureAlign,
                questionType: question.questionType,
                ...(reveal ? { answerText: question.answerText, analysis: question.analysis } : {}),
            })),
        },
    };
}

export async function saveAnswer(paperId: string, userId: string, attemptId: string, questionId: string, input: SaveAnswerInput) {
    const data = saveAnswerSchema.parse(input);
    let oldImage: string | null = null;
    const answer = await prisma.$transaction(async tx => {
        const attempt = await lockAttempt(tx, paperId, userId, attemptId, ['answering']);
        if (!attempt.paper.questions.some(question => question.id === questionId)) throw new Error('EXAM_QUESTION_NOT_FOUND');
        const old = attempt.answers.find(answer => answer.examQuestionId === questionId);
        const { answerImage, durationSec, ...fields } = data;
        if (answerImage !== undefined) oldImage = old?.answerImageUrl ?? null;
        const answerImageUrl = answerImage ? await storeImage(answerImage) : answerImage;
        if (durationSec !== undefined) await tx.examAttempt.update({ where: { id: attemptId }, data: { durationSec: Math.max(attempt.durationSec ?? 0, durationSec) } });
        return tx.examAttemptAnswer.upsert({
            where: { attemptId_examQuestionId: { attemptId, examQuestionId: questionId } },
            create: { attemptId, examQuestionId: questionId, ...fields, answerImageUrl },
            update: { ...fields, answerImageUrl },
        });
    });
    if (oldImage) await removeUnreferencedImages(prisma, [oldImage]);
    return answer;
}

export async function submitAttempt(paperId: string, userId: string, attemptId: string, durationSec?: number) {
    submitAttemptSchema.parse({ durationSec });
    await prisma.$transaction(async tx => {
        const attempt = await lockAttempt(tx, paperId, userId, attemptId, ['answering']);
        for (const question of attempt.paper.questions) {
            const answer = attempt.answers.find(answer => answer.examQuestionId === question.id);
            const empty = !answer?.answerText?.trim() && !answer?.answerImageUrl;
            const correct = !answer?.answerImageUrl && Boolean(answer?.answerText && matchAnswer(answer.answerText, question.answerText ?? '', question.questionText ?? ''));
            const result = { aiResult: correct ? 'correct' : null, finalResult: empty ? 'not_attempted' : correct ? 'correct' : null };
            await tx.examAttemptAnswer.upsert({
                where: { attemptId_examQuestionId: { attemptId, examQuestionId: question.id } },
                create: { attemptId, examQuestionId: question.id, ...result }, update: result,
            });
        }
        await tx.examAttempt.update({ where: { id: attemptId }, data: { status: 'reviewing', submittedAt: new Date(), durationSec: durationSec === undefined ? attempt.durationSec : Math.max(attempt.durationSec ?? 0, durationSec) } });
    });
    return getAttempt(paperId, userId, attemptId);
}

export async function setFinalResult(paperId: string, userId: string, attemptId: string, questionId: string, finalResult: FinalResult) {
    finalResultSchema.parse(finalResult);
    return prisma.$transaction(async tx => {
        const attempt = await lockAttempt(tx, paperId, userId, attemptId, ['reviewing', 'done']);
        if (!attempt.paper.questions.some(question => question.id === questionId)) throw new Error('EXAM_QUESTION_NOT_FOUND');
        return tx.examAttemptAnswer.upsert({
            where: { attemptId_examQuestionId: { attemptId, examQuestionId: questionId } },
            create: { attemptId, examQuestionId: questionId, finalResult }, update: { finalResult },
        });
    });
}

export async function confirmAttempt(paperId: string, userId: string, attemptId: string, input: ConfirmAttemptInput = {}): Promise<string[]> {
    const { takenAt } = confirmAttemptSchema.parse(input);
    const oldImages: string[] = [];
    const affected = await prisma.$transaction(async tx => {
        const attempt = await lockAttempt(tx, paperId, userId, attemptId, ['reviewing', 'done']);
        if (attempt.kind === 'manual' && takenAt) manualTakenAtSchema.parse(takenAt);
        const answers = new Map(attempt.answers.map(answer => [answer.examQuestionId, answer]));
        if (attempt.paper.questions.some(question => question.errorItemId && !answers.get(question.id)?.finalResult)) throw new Error('EXAM_ATTEMPT_INCOMPLETE');
        const previous = await tx.practiceRecord.findMany({ where: { examAttemptId: attemptId }, select: { answerImageUrl: true } });
        for (const record of previous) if (record.answerImageUrl) oldImages.push(record.answerImageUrl);
        await tx.practiceRecord.deleteMany({ where: { examAttemptId: attemptId } });
        // 手动补录可指定考试时间；其他方式固定使用交卷时间，重复确认默认保留原时间。
        const submittedAt = attempt.kind === 'manual' && takenAt ? new Date(takenAt) : attempt.submittedAt ?? new Date();
        const ids = new Set<string>();
        for (const question of attempt.paper.questions) {
            if (!question.errorItemId) continue;
            const answer = answers.get(question.id)!;
            await tx.practiceRecord.create({ data: {
                ...examRecordData(userId, attempt.paper, question, answer.finalResult!, submittedAt),
                // 整卷用时记在作答上；逐题没有单独计时，记录里不写用时。
                examAttemptId: attemptId,
                wrongAnswerText: answer.answerText,
                answerImageUrl: answer.answerImageUrl,
                recognizedAnswer: answer.recognizedAnswer, gradeReason: answer.aiReason,
            } });
            ids.add(question.errorItemId);
        }
        await syncExamResults(tx, paperId, ids);
        await tx.examAttempt.update({ where: { id: attemptId }, data: { status: 'done', submittedAt, confirmedAt: new Date() } });
        return [...ids];
    }, { timeout: 30000 });
    await removeUnreferencedImages(prisma, oldImages);
    return affected;
}

export async function deleteAttempt(paperId: string, userId: string, attemptId: string): Promise<void> {
    const images = await prisma.$transaction(async tx => {
        const attempt = await lockAttempt(tx, paperId, userId, attemptId, ['answering', 'grading', 'reviewing']);
        await tx.examAttempt.delete({ where: { id: attemptId } });
        return [...attempt.answers.flatMap(answer => answer.answerImageUrl ? [answer.answerImageUrl] : []), ...JSON.parse(attempt.pageImages ?? '[]') as string[]];
    });
    await removeUnreferencedImages(prisma, images);
}
