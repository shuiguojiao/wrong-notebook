import 'server-only';

import { z } from 'zod';
import { answerImageSchema } from '@/lib/handwriting/image';
import { removeUnreferencedImages } from '@/lib/image-maintenance';
import { storeImage } from '@/lib/image-storage';
import { prisma } from '@/lib/prisma';
import { MAX_EXAM_PAGES, pageIssuesSchema, pageLocationsSchema } from './exam-photo-schema';
import type { ExamPageIssue } from './exam-photo-schema';

// 整页须能被服务端裁剪工具解码；浏览器照片管线统一输出 JPEG。
const examPageImageSchema = answerImageSchema.refine(image => /^data:image\/(?:jpeg|png);/.test(image), 'Exam pages must be JPEG or PNG');
export const addPageSchema = z.object({ image: examPageImageSchema, expected: z.array(z.string()).max(MAX_EXAM_PAGES) }).strict();
export const replacePagesSchema = z.object({ pages: z.array(z.string()).max(MAX_EXAM_PAGES), expected: z.array(z.string()).max(MAX_EXAM_PAGES) }).strict();
export type PageOperation = { kind: 'add'; image: string; expected: string[] } | { kind: 'replace'; pages: string[]; expected: string[] } | { kind: 'delete'; index: number; reference?: string };

/** 写锁和照片快照保证并发排序、重拍与交卷不会覆盖彼此。 */
export async function changeExamPages(paperId: string, userId: string, attemptId: string, operation: PageOperation) {
    const garbage: string[] = [];
    try {
        return await prisma.$transaction(async tx => {
            const changed = await tx.examAttempt.updateMany({ where: { id: attemptId, paperId, userId, paper: { userId } }, data: { updatedAt: new Date() } });
            if (!changed.count) throw new Error('EXAM_ATTEMPT_NOT_FOUND');
            const attempt = await tx.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
            if (attempt.kind !== 'photo' || attempt.status !== 'answering') throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
            const previous = JSON.parse(attempt.pageImages ?? '[]') as string[];
            garbage.push(...previous);
            let pages: string[];
            if (operation.kind === 'delete') {
                z.number().int().min(0).max(previous.length - 1).parse(operation.index);
                if (operation.reference !== undefined && previous[operation.index] !== operation.reference) throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
                pages = previous.filter((_, index) => index !== operation.index);
            } else {
                if (JSON.stringify(operation.expected) !== JSON.stringify(previous)) {
                    // 网络丢失响应后重试同一次追加，已落盘的相同照片直接返回。
                    const replay = operation.kind === 'add' ? await storeImage(operation.image) : null;
                    if (replay) garbage.push(replay);
                    if (replay && JSON.stringify([...operation.expected, replay]) === JSON.stringify(previous)) {
                        return { pages: previous, issues: pageIssuesSchema.parse(JSON.parse(attempt.pageIssues ?? '[]')) };
                    }
                    throw new Error('EXAM_ATTEMPT_INVALID_STATUS');
                }
                const incoming = operation.kind === 'add' ? [...previous, operation.image] : operation.pages;
                z.array(z.string()).max(MAX_EXAM_PAGES).parse(incoming);
                pages = [];
                for (const image of incoming) {
                    if (!previous.includes(image)) examPageImageSchema.parse(image);
                    const stored = await storeImage(image);
                    garbage.push(stored);
                    pages.push(stored);
                }
            }
            const issues = pageIssuesSchema.parse(JSON.parse(attempt.pageIssues ?? '[]'))
                .flatMap<ExamPageIssue>(issue => {
                    if (issue.reason === 'locate_failed') return [issue];
                    const index = pages.indexOf(previous[issue.index]);
                    return index < 0 ? [] : [{ ...issue, index }];
                });
            await tx.examAttempt.update({ where: { id: attemptId }, data: { pageImages: JSON.stringify(pages), pageIssues: JSON.stringify(issues), pageLocations: JSON.stringify(pageLocationsSchema.parse(JSON.parse(attempt.pageLocations ?? '[]')).filter(page => pages.includes(page.image))) } });
            return { pages, issues };
        }, { timeout: 30000 });
    } finally {
        await removeUnreferencedImages(prisma, garbage);
    }
}
