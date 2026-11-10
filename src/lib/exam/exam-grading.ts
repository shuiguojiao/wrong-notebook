import "server-only";

import type { User } from '@prisma/client';
import { consumeAiQuota, quotaRejectionCode } from '@/lib/ai-quota';
import { hasAiDataConsent } from '@/lib/ai-consent-store';
import { getAiUsageContext, setAiUsageId } from '@/lib/ai-usage-context';
import { findRunningTask } from '@/lib/background-tasks';
import type { BackgroundTaskHandle } from '@/lib/background-tasks';
import { removeUnreferencedImages } from '@/lib/image-maintenance';
import { imageDataUrl, storeImage } from '@/lib/image-storage';
import { createLogger } from '@/lib/logger';
import { gradeAnswer } from '@/lib/practice/grade-answer';
import { prisma } from '@/lib/prisma';

const logger = createLogger('exam:grading');
export const gradingTarget = (id: string) => `exam-attempt:${id}:grade`;
export const GRADE_FAILED = 'EXAM_GRADE_FAILED';

/** 判题中断只补齐未知结果，不自动再次发送学生数据。 */
export async function recoverExamGrading(attemptId: string, userId: string) {
    if (findRunningTask(userId, gradingTarget(attemptId))) return;
    await prisma.$transaction(async tx => {
        const attempt = await tx.examAttempt.findFirst({ where: { id: attemptId, userId, status: 'grading' }, include: { answers: { select: { answerImageUrl: true } } } });
        const retryPages = attempt?.kind === 'photo' && !attempt.answers.some(answer => answer.answerImageUrl);
        const changed = await tx.examAttempt.updateMany({ where: { id: attemptId, userId, status: 'grading' }, data: { status: retryPages ? 'answering' : 'reviewing' } });
        if (changed.count) await tx.examAttemptAnswer.updateMany({ where: { attemptId, aiResult: null, finalResult: null }, data: { aiResult: 'unknown', aiReason: GRADE_FAILED } });
    });
}

export async function gradeExamQuestion(attemptId: string, questionId: string) {
    const answer = await prisma.examAttemptAnswer.findUniqueOrThrow({ where: { attemptId_examQuestionId: { attemptId, examQuestionId: questionId } }, include: { examQuestion: true } });
    const question = answer.examQuestion;
    try {
        const refs = JSON.parse(answer.gradingImages ?? '[]') as string[];
        // 兼容只有单张展示图的旧版作答。
        const images = await Promise.all((refs.length ? refs : answer.answerImageUrl ? [answer.answerImageUrl] : []).map(ref => imageDataUrl(ref)));
        const result = await gradeAnswer({ questionText: question.questionText ?? '', answerText: question.answerText ?? '', analysis: question.analysis, userAnswer: (answer.pageIndex !== null ? answer.recognizedAnswer : answer.answerText) ?? '', answerImages: images });
        const aiResult = result.unreadable || result.correct === null ? 'unknown' : result.correct ? 'correct' : 'wrong';
        await prisma.examAttemptAnswer.update({ where: { id: answer.id }, data: { aiResult, aiReason: result.reason, recognizedAnswer: answer.pageIndex !== null ? answer.recognizedAnswer : result.recognizedAnswer ?? null, finalResult: aiResult === 'unknown' ? null : aiResult } });
    } catch {
        await prisma.examAttemptAnswer.update({ where: { id: answer.id }, data: { aiResult: 'unknown', aiReason: GRADE_FAILED, finalResult: null } });
        // 不把含学生解答的服务商错误写进日志。
        logger.warn({ attemptId, questionId }, '试卷单题判题失败');
    }
}

/** 三个工作循环共享序号，单题失败由单题函数隔离。 */
export async function runExamGrading(attemptId: string, questionIds: string[], task: BackgroundTaskHandle, handMarkIds = questionIds) {
    const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId }, select: { kind: true } });
    let next = 0;
    let done = 0;
    try {
        await Promise.allSettled(Array.from({ length: Math.min(3, questionIds.length) }, async () => {
            while (next < questionIds.length) {
                const id = questionIds[next++];
                try { await gradeExamQuestion(attemptId, id); }
                catch { logger.warn({ attemptId, questionId: id }, '试卷单题结果写回失败'); }
                task.setProgress(++done, questionIds.length);
            }
        }));
    } finally {
        await prisma.examAttemptAnswer.updateMany({ where: { attemptId, examQuestionId: { in: questionIds }, aiResult: null, finalResult: null }, data: { aiResult: 'unknown', aiReason: GRADE_FAILED } });
        if (attempt?.kind === 'photo') {
            const { applyExamHandMarks } = await import('./exam-photo-grading');
            await applyExamHandMarks(attemptId, handMarkIds);
        }
        await prisma.examAttempt.updateMany({ where: { id: attemptId, status: 'grading' }, data: { status: 'reviewing' } });
    }
}

/** 重判复用整卷额度记录；若重启发生在首次扣额前，只补记该卷一次额度。 */
export async function prepareExamRetry(user: User, attemptId: string, questionId: string, photos?: string[]) {
    if (!await hasAiDataConsent(user)) throw new Error('AI_CONSENT_REQUIRED');
    const pending = await prisma.examAttempt.findFirst({ where: { id: attemptId, userId: user.id, status: 'reviewing' }, include: { answers: { where: { examQuestionId: questionId }, include: { examQuestion: { select: { answerText: true } } } } } });
    if (!pending) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
    const previous = pending.answers[0];
    if (!previous) throw new Error('EXAM_QUESTION_NOT_FOUND');
    if (!previous.examQuestion.answerText?.trim() || (!photos?.length && !previous.answerText?.trim() && !previous.answerImageUrl && !previous.gradingImages)) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
    if (previous.gradingRetries >= 2) throw new Error('EXAM_GRADE_RETRY_LIMIT');
    if (!pending.gradingUsageId && previous.aiReason !== GRADE_FAILED) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
    if (!pending.gradingUsageId) {
        const limited = await consumeAiQuota(user, 'exam-grade');
        if (limited) {
            await prisma.examAttemptAnswer.update({ where: { id: previous.id }, data: { aiReason: await quotaRejectionCode(limited) } });
            return limited;
        }
    }
    const garbage: string[] = [];
    await prisma.$transaction(async tx => {
        const attempt = await tx.examAttempt.findFirst({ where: { id: attemptId, userId: user.id, status: 'reviewing' } });
        if (photos && attempt?.kind !== 'photo') throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
        if (!attempt) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
        const answer = await tx.examAttemptAnswer.findUnique({ where: { attemptId_examQuestionId: { attemptId, examQuestionId: questionId } }, include: { examQuestion: true } });
        if (!answer) throw new Error('EXAM_QUESTION_NOT_FOUND');
        if (!answer.examQuestion.answerText?.trim() || (!photos?.length && !answer.answerText?.trim() && !answer.answerImageUrl && !answer.gradingImages)) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
        // 未获整卷授权（例如额度不足）的作答不能借免费重判绕过额度。
        if (!attempt.gradingUsageId && answer.aiReason !== GRADE_FAILED) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
        if (answer.gradingRetries >= 2) throw new Error('EXAM_GRADE_RETRY_LIMIT');
        const replacements = photos ? await Promise.all(photos.map(photo => storeImage(photo))) : undefined;
        if (replacements) garbage.push(...JSON.parse(answer.gradingImages ?? '[]') as string[], ...(answer.answerImageUrl ? [answer.answerImageUrl] : []));
        const changed = await tx.examAttemptAnswer.updateMany({ where: { id: answer.id, gradingRetries: answer.gradingRetries }, data: { ...(replacements ? { gradingImages: JSON.stringify(replacements), answerImageUrl: replacements[0], answerText: null, recognizedAnswer: null, pageIndex: null, region: null } : {}), gradingRetries: { increment: 1 }, aiResult: null, aiReason: null, finalResult: null } });
        if (!changed.count) throw new Error('EXAM_GRADE_RETRY_LIMIT');
        const usageId = attempt.gradingUsageId ?? getAiUsageContext()?.id;
        await tx.examAttempt.update({ where: { id: attemptId }, data: { gradingUsageId: usageId, status: 'grading' } });
        setAiUsageId(usageId, { userId: user.id, admin: user.role === 'admin' });
    });
    await removeUnreferencedImages(prisma, garbage);
    return null;
}

export function currentGradingUsageId() { return getAiUsageContext()?.id; }
