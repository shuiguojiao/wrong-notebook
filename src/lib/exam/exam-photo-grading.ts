import 'server-only';

import { getAIService } from '@/lib/ai';
import type { BackgroundTaskHandle } from '@/lib/background-tasks';
import { removeUnreferencedImages } from '@/lib/image-maintenance';
import { imageDataUrl, readStoredImage, storeImage } from '@/lib/image-storage';
import { prisma } from '@/lib/prisma';
import { cropSourceImage } from '@/lib/source-page/crop';
import { groupExamQuestions } from './exam-sections';
import { examPaperCode } from './exam-print';
import { EXAM_ANSWER_NOT_FOUND, EXAM_ANSWER_UNREADABLE, examPageIssue, hasMajorityHandMarks, pageLocationsSchema } from './exam-photo-schema';
import { runExamGrading } from './exam-grading';

/** 定位缓存跟随内容引用，重排不重新识别，重拍只识别变化的页。 */
export async function runPhotoExamGrading(attemptId: string, task: BackgroundTaskHandle, force = false) {
    const attempt = await prisma.examAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        include: { paper: { include: { questions: {
            orderBy: { order: 'asc' },
            include: { errorItem: { select: { questionType: true, subject: { select: { name: true } } } } },
        } } } },
    });
    const images = JSON.parse(attempt.pageImages ?? '[]') as string[];
    const cached = pageLocationsSchema.parse(JSON.parse(attempt.pageLocations ?? '[]'));
    const numbered = attempt.paper.groupByType
        ? groupExamQuestions(attempt.paper.questions.map(question => ({ ...question, errorItemQuestionType: question.errorItem?.questionType })), 'zh').flatMap(section => section.items)
        : attempt.paper.questions.map((question, index) => ({ question, displayNumber: index + 1 }));
    const questions = numbered.map(({ question, displayNumber }) => ({ number: displayNumber, questionType: question.questionType, questionText: question.questionText ?? '' }));
    const code = examPaperCode(attempt.paperId);
    const located = [...cached];
    const changedImages = [...new Set(images.filter(image => !cached.some(page => page.image === image)))];
    let next = 0;
    await Promise.allSettled(Array.from({ length: Math.min(3, changedImages.length) }, async () => {
        while (next < changedImages.length) {
            const image = changedImages[next++];
            const result = await getAIService().locateExamAnswers({ image: await imageDataUrl(image), paperCode: code, questions });
            located.push({ image, result });
        }
    }));
    // 网络失败时也保留已成功页，等待所有并发结束后才释放整卷任务。
    await prisma.examAttempt.updateMany({ where: { id: attemptId, status: 'grading' }, data: { pageLocations: JSON.stringify(located.filter(page => images.includes(page.image))) } });
    if (images.some(image => !located.some(page => page.image === image))) {
        await prisma.examAttempt.updateMany({ where: { id: attemptId, status: 'grading' }, data: {
            status: 'answering', pageIssues: JSON.stringify([{ index: -1, reason: 'locate_failed' }]),
        } });
        return;
    }
    const current = images.map(image => located.find(page => page.image === image)!);
    const issues = force ? [] : current.flatMap((page, index) => {
        const reason = examPageIssue(page.result, code);
        return reason ? [{ index, reason }] : [];
    });
    const updated = await prisma.examAttempt.updateMany({ where: { id: attemptId, status: 'grading' }, data: {
        pageLocations: JSON.stringify(current), pageIssues: JSON.stringify(issues), ...(issues.length ? { status: 'answering' } : {}),
    } });
    if (!updated.count || issues.length) return;
    const oldImages: string[] = [];
    const pending: string[] = [];
    await prisma.$transaction(async tx => {
        // 删除或放弃作答会使后台结果失效。
        const active = await tx.examAttempt.updateMany({ where: { id: attemptId, status: 'grading' }, data: { updatedAt: new Date() } });
        if (!active.count) return;
        for (const { question, displayNumber } of numbered) {
            const parts = current.flatMap((page, pageIndex) => (page.result.pageReadable ? page.result.answers : []).filter(answer => answer.number === displayNumber).map(answer => ({ ...answer, pageIndex })));
            const old = await tx.examAttemptAnswer.findUnique({ where: { attemptId_examQuestionId: { attemptId, examQuestionId: question.id } } });
            oldImages.push(...JSON.parse(old?.gradingImages ?? '[]') as string[], ...(old?.answerImageUrl ? [old.answerImageUrl] : []));
            const refs: string[] = [];
            for (const part of parts.slice(0, 4)) {
                const source = await readStoredImage(images[part.pageIndex]);
                if (!source) throw new Error('EXAM_IMAGE_MISSING');
                // 来源裁剪工具自带 0.8% 边距，先补 2.2%，合计外扩 3%。
                const r = part.region;
                const x = Math.max(0, r.x - 0.022);
                const y = Math.max(0, r.y - 0.022);
                const region = { x, y, width: Math.min(1, r.x + r.width + 0.022) - x, height: Math.min(1, r.y + r.height + 0.022) - y };
                const cropped = cropSourceImage(source.bytes, source.mimeType, [region]);
                refs.push(await storeImage(`data:image/jpeg;base64,${cropped.toString('base64')}`));
            }
            const transcript = parts.map(part => part.transcript).join('\n').slice(0, 20000);
            const unreadable = parts.some(part => !part.legible) || parts.length > 4;
            const marks = [...new Set(parts.map(part => part.handMark).filter(mark => mark !== 'none'))];
            const handMark = marks.length === 1 ? marks[0] : null;
            const fields = {
                answerText: null, recognizedAnswer: transcript || null,
                pageIndex: parts[0]?.pageIndex ?? null, region: parts[0] ? JSON.stringify(parts[0].region) : null,
                answerImageUrl: refs[0] ?? null, gradingImages: refs.length ? JSON.stringify(refs) : null,
                handMark, aiResult: unreadable ? 'unknown' : null, finalResult: null,
                aiReason: !parts.length ? EXAM_ANSWER_NOT_FOUND : unreadable ? EXAM_ANSWER_UNREADABLE : null,
            };
            await tx.examAttemptAnswer.upsert({ where: { attemptId_examQuestionId: { attemptId, examQuestionId: question.id } }, create: { attemptId, examQuestionId: question.id, ...fields }, update: fields });
            if (parts.length && !unreadable && question.answerText?.trim()) pending.push(question.id);
        }
    }, { timeout: 60000 });
    await removeUnreferencedImages(prisma, oldImages);
    await runExamGrading(attemptId, pending, task, numbered.map(item => item.question.id));
}

export async function applyExamHandMarks(attemptId: string, questionIds: string[]) {
    const answers = await prisma.examAttemptAnswer.findMany({ where: { attemptId }, include: { examQuestion: { select: { errorItemId: true } } } });
    const originals = answers.filter(answer => answer.examQuestion.errorItemId);
    if (hasMajorityHandMarks(originals.map(answer => answer.handMark), originals.length)) {
        await prisma.$transaction(answers.filter(answer => questionIds.includes(answer.examQuestionId) && (answer.handMark === 'correct' || answer.handMark === 'wrong')).map(answer => prisma.examAttemptAnswer.update({ where: { id: answer.id }, data: { finalResult: answer.handMark } })));
    }
}
