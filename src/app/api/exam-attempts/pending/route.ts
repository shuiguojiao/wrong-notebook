import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { recoverExamGrading } from '@/lib/exam/exam-grading';
import { prisma } from '@/lib/prisma';

/** 今天只读取需要关注的作答摘要，不包含题目、作答与图片。 */
export const GET = withUser(async (_req, { user }) => {
    const where = { userId: user.id, kind: { in: ['online', 'photo'] }, OR: [{ status: { in: ['grading', 'reviewing'] } }, { status: 'answering', pageIssues: { not: '[]' } }] };
    const grading = await prisma.examAttempt.findMany({ where: { ...where, status: 'grading' }, select: { id: true } });
    for (const attempt of grading) await recoverExamGrading(attempt.id, user.id);
    const attempts = await prisma.examAttempt.findMany({ where, orderBy: { updatedAt: 'desc' }, select: { id: true, paperId: true, status: true, pageIssues: true, paper: { select: { title: true } } } });
    return NextResponse.json(attempts.filter(attempt => attempt.status !== 'answering' || JSON.parse(attempt.pageIssues ?? '[]').length > 0).map(({ pageIssues: _issues, ...attempt }) => attempt));
});
