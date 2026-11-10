import "server-only";

import type { Prisma } from "@prisma/client";
import { groupExamQuestions } from "@/lib/exam/exam-sections";
import { matchAnswer } from "@/lib/answer-match";
import { storeImage } from "@/lib/image-storage";
import { removeUnreferencedImages } from "@/lib/image-maintenance";
import { hasAiDataConsent } from '@/lib/ai-consent-store';
import { createErrorResponse, ErrorCode } from '@/lib/api-errors';
import { consumeAiQuota, quotaRejectionCode } from '@/lib/ai-quota';
import { captureAiUsage, withAiUsageScope, setAiUsageId } from '@/lib/ai-usage-context';
import { findRunningTask, reserveBackgroundTask, runReservedTask } from '@/lib/background-tasks';
import { currentGradingUsageId, gradingTarget, recoverExamGrading, runExamGrading } from './exam-grading';
import { prisma } from "@/lib/prisma";
import { examRecordData, syncExamResults } from "./exam-records";
import { attemptKindSchema, confirmAttemptSchema, manualTakenAtSchema, finalResultSchema, saveAnswerSchema, submitAttemptSchema } from "./exam-attempt-schema";
import type { AttemptKind, ConfirmAttemptInput, FinalResult, SaveAnswerInput } from "./exam-attempt-schema";

import { runPhotoExamGrading } from './exam-photo-grading';
import { hasMajorityHandMarks, pageIssuesSchema } from './exam-photo-schema';

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
    const initial = await prisma.examAttempt.findFirst({ where: { id: attemptId, paperId, userId, paper: { userId } }, select: { status: true } });
    if (initial?.status === 'grading') await recoverExamGrading(attemptId, userId);
    const attempt = await prisma.examAttempt.findFirst({ where: { id: attemptId, paperId, userId, paper: { userId } }, include: attemptInclude });
    if (!attempt) throw new Error('EXAM_ATTEMPT_NOT_FOUND');
    const chronology = await prisma.examAttempt.findMany({ where: { paperId, userId }, orderBy: [{ startedAt: 'asc' }, { id: 'asc' }], select: { id: true } });
    const { paper, pageImages, pageIssues, pageLocations: _locations, ...rest } = attempt;
    const reveal = attempt.status === 'reviewing' || attempt.status === 'done';
    // 题号与试卷详情、打印页共用排序；这里只取编号，不使用大题标题。
    const numbered = paper.groupByType
        ? groupExamQuestions(paper.questions.map(question => ({ ...question, errorItemQuestionType: question.errorItem?.questionType })), 'zh').flatMap(section => section.items)
        : paper.questions.map((question, index) => ({ question, displayNumber: index + 1 }));
    const numbers = new Map(numbered.map(item => [item.question.id, item.displayNumber]));
    return {
        ...rest,
        pageImages,
        pages: JSON.parse(pageImages ?? '[]') as string[],
        pageIssues: pageIssuesSchema.parse(JSON.parse(pageIssues ?? '[]')),
        handMarked: hasMajorityHandMarks(attempt.answers.filter(answer => paper.questions.find(question => question.id === answer.examQuestionId)?.errorItemId).map(answer => answer.handMark), paper.questions.filter(question => question.errorItemId).length),
        gradingNotice: attempt.answers.find(answer => answer.aiReason?.startsWith('AI_') || (attempt.kind === 'photo' && attempt.status === 'answering' && answer.aiReason === 'EXAM_GRADE_FAILED'))?.aiReason ?? null,
        answers: attempt.answers.map(({ gradingImages, ...answer }) => ({ ...answer, canRetry: attempt.status === 'reviewing' && answer.gradingRetries < 2 && !!(attempt.gradingUsageId || answer.aiReason === 'EXAM_GRADE_FAILED') && !!(answer.answerText?.trim() || answer.answerImageUrl || gradingImages) && !!paper.questions.find(question => question.id === answer.examQuestionId)?.answerText?.trim() })),
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
    const oldImages: string[] = [];
    const answer = await prisma.$transaction(async tx => {
        const attempt = await lockAttempt(tx, paperId, userId, attemptId, ['answering']);
        if (!attempt.paper.questions.some(question => question.id === questionId)) throw new Error('EXAM_QUESTION_NOT_FOUND');
        const old = attempt.answers.find(answer => answer.examQuestionId === questionId);
        const { answerImage, answerImages, durationSec, ...fields } = data;
        if (answerImage !== undefined && old?.answerImageUrl) oldImages.push(old.answerImageUrl);
        const originals = answerImages === undefined && answerImage !== undefined ? (answerImage ? [answerImage] : []) : answerImages;
        if (originals !== undefined) oldImages.push(...JSON.parse(old?.gradingImages ?? '[]') as string[]);
        const gradingImages = originals === undefined ? undefined : originals?.length ? JSON.stringify(await Promise.all(originals.map(image => storeImage(image)))) : null;
        const answerImageUrl = answerImage ? await storeImage(answerImage) : answerImage;
        if (durationSec !== undefined) await tx.examAttempt.update({ where: { id: attemptId }, data: { durationSec: Math.max(attempt.durationSec ?? 0, durationSec) } });
        return tx.examAttemptAnswer.upsert({
            where: { attemptId_examQuestionId: { attemptId, examQuestionId: questionId } },
            create: { attemptId, examQuestionId: questionId, ...fields, answerImageUrl, gradingImages },
            update: { ...fields, answerImageUrl, gradingImages },
        });
    });
    await removeUnreferencedImages(prisma, oldImages);
    return answer;
}

export async function submitAttempt(paperId: string, userId: string, attemptId: string, durationSec?: number, force?: boolean) {
    submitAttemptSchema.parse({ durationSec, force });
    const task = reserveBackgroundTask({ userId, kind: 'exam-grade', target: gradingTarget(attemptId), link: `/exams/${paperId}/attempts/${attemptId}` });
    if (!task) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
    const pending: string[] = [];
    let photo = false;
    let usageId: string | null = null;
    try {
        await prisma.$transaction(async tx => {
            const attempt = await lockAttempt(tx, paperId, userId, attemptId, ['answering']);
            photo = attempt.kind === 'photo';
            if (force && (!photo || !pageIssuesSchema.parse(JSON.parse(attempt.pageIssues ?? '[]')).length)) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
            usageId = attempt.gradingUsageId;
            if (photo && !(JSON.parse(attempt.pageImages ?? '[]') as string[]).length) throw new Error('EXAM_ATTEMPT_INCOMPLETE');
            for (const question of attempt.paper.questions) {
                const answer = attempt.answers.find(answer => answer.examQuestionId === question.id);
                const hasImage = !!answer?.answerImageUrl || !!answer?.gradingImages;
                const empty = !answer?.answerText?.trim() && !hasImage;
                const correct = !hasImage && Boolean(answer?.answerText && matchAnswer(answer.answerText, question.answerText ?? '', question.questionText ?? ''));
                if (photo || (!empty && !correct && question.answerText?.trim())) pending.push(question.id);
                const result = photo ? { aiResult: null, finalResult: null } : { aiResult: correct ? 'correct' : null, finalResult: empty ? 'not_attempted' : correct ? 'correct' : null };
                await tx.examAttemptAnswer.upsert({ where: { attemptId_examQuestionId: { attemptId, examQuestionId: question.id } }, create: { attemptId, examQuestionId: question.id, ...result }, update: result });
            }
            await tx.examAttempt.update({ where: { id: attemptId }, data: { status: pending.length ? 'grading' : 'reviewing', submittedAt: new Date(), durationSec: durationSec === undefined ? attempt.durationSec : Math.max(attempt.durationSec ?? 0, durationSec) } });
        });
        if (!pending.length) task.cancel();
        else await withAiUsageScope(async () => {
            const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
            const consented = await hasAiDataConsent(user);
            const limited = !consented ? createErrorResponse(ErrorCode.AI_CONSENT_REQUIRED, 403, ErrorCode.AI_CONSENT_REQUIRED) : usageId ? null : await consumeAiQuota(user, 'exam-grade');
            if (limited) {
                const code = await quotaRejectionCode(limited);
                await prisma.$transaction([
                    prisma.examAttemptAnswer.updateMany({ where: { attemptId, examQuestionId: { in: pending } }, data: { aiReason: code } }),
                    prisma.examAttempt.update({ where: { id: attemptId }, data: { status: 'reviewing' } }),
                ]);
                task.cancel();
            } else {
                if (usageId) setAiUsageId(usageId, { userId, admin: user.role === 'admin' });
                await prisma.examAttempt.update({ where: { id: attemptId }, data: { gradingUsageId: usageId ?? currentGradingUsageId() } });
                void runReservedTask(task, captureAiUsage(() => photo ? runPhotoExamGrading(attemptId, task, force) : runExamGrading(attemptId, pending, task))).catch(() => recoverExamGrading(attemptId, userId));
            }
        });
    } catch (error) { task.cancel(); throw error; }
    return getAttempt(paperId, userId, attemptId);
}

/** 定位失败后由学生逐题录入，保留拍照来源与整页回看。 */
export async function reviewPhotoAttemptManually(paperId: string, userId: string, attemptId: string) {
    if (findRunningTask(userId, gradingTarget(attemptId))) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
    await prisma.$transaction(async tx => {
        const attempt = await lockAttempt(tx, paperId, userId, attemptId, ['answering']);
        const issues = pageIssuesSchema.parse(JSON.parse(attempt.pageIssues ?? '[]'));
        if (attempt.kind !== 'photo' || !issues.some(issue => issue.reason === 'locate_failed')) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
        for (const question of attempt.paper.questions) {
            const fields = { aiResult: null, aiReason: null, finalResult: null, handMark: null };
            await tx.examAttemptAnswer.upsert({
                where: { attemptId_examQuestionId: { attemptId, examQuestionId: question.id } },
                create: { attemptId, examQuestionId: question.id, ...fields }, update: fields,
            });
        }
        await tx.examAttempt.update({ where: { id: attemptId }, data: { status: 'reviewing', pageIssues: null } });
    });
    return getAttempt(paperId, userId, attemptId);
}

export async function setFinalResult(paperId: string, userId: string, attemptId: string, questionId: string, finalResult: FinalResult) {
    finalResultSchema.parse(finalResult);
    if (findRunningTask(userId, gradingTarget(attemptId))) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
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
    if (findRunningTask(userId, gradingTarget(attemptId))) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
    const oldImages: string[] = [];
    const affected = await prisma.$transaction(async tx => {
        const attempt = await lockAttempt(tx, paperId, userId, attemptId, ['reviewing', 'done']);
        if (attempt.kind === 'manual' && takenAt) manualTakenAtSchema.parse(takenAt);
        oldImages.push(...attempt.answers.flatMap(answer => JSON.parse(answer.gradingImages ?? '[]') as string[]));
        await tx.examAttemptAnswer.updateMany({ where: { attemptId }, data: { gradingImages: null } });
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
        await tx.examAttempt.update({ where: { id: attemptId }, data: { status: 'done', submittedAt, confirmedAt: new Date(), pageLocations: null } });
        return [...ids];
    }, { timeout: 30000 });
    await removeUnreferencedImages(prisma, oldImages);
    return affected;
}

export async function deleteAttempt(paperId: string, userId: string, attemptId: string): Promise<void> {
    const images = await prisma.$transaction(async tx => {
        const attempt = await lockAttempt(tx, paperId, userId, attemptId, ['answering', 'grading', 'reviewing']);
        await tx.examAttempt.delete({ where: { id: attemptId } });
        return [...attempt.answers.flatMap(answer => [...(answer.answerImageUrl ? [answer.answerImageUrl] : []), ...JSON.parse(answer.gradingImages ?? '[]') as string[]]), ...JSON.parse(attempt.pageImages ?? '[]') as string[]];
    });
    await removeUnreferencedImages(prisma, images);
}
