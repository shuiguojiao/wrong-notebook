import { z } from 'zod';
import { answerImageSchema } from '@/lib/handwriting/image';
import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { captureAiUsage } from '@/lib/ai-usage-context';
import { taskAlreadyRunning } from '@/lib/api-errors';
import { reserveBackgroundTask, runReservedTask } from '@/lib/background-tasks';
import { getAttempt } from '@/lib/exam/exam-attempt';
import { attemptResponse } from '@/lib/exam/exam-attempt-route';
import type { AnswerRouteContext } from '@/lib/exam/exam-attempt-route';
import { runExamGrading, recoverExamGrading, gradingTarget, prepareExamRetry } from '@/lib/exam/exam-grading';

export const POST = withUser(async (req: Request, { user, params }: AnswerRouteContext) => attemptResponse(async () => {
    const { id, aid, questionId } = await params;
    await getAttempt(id, user.id, aid);
    const raw = await req.text();
    const { photos } = z.object({ photos: z.array(answerImageSchema).min(1).max(3).optional() }).strict().parse(raw ? JSON.parse(raw) : {});
    const task = reserveBackgroundTask({ userId: user.id, kind: 'exam-grade', target: gradingTarget(aid) });
    if (!task) return taskAlreadyRunning({ id: '', kind: 'exam-grade', startedAt: '', target: gradingTarget(aid) });
    try {
        const limited = await prepareExamRetry(user, aid, questionId, photos);
        if (limited) { task.cancel(); return limited; }
    } catch (error) { task.cancel(); throw error; }
    void runReservedTask(task, captureAiUsage(() => runExamGrading(aid, [questionId], task))).catch(() => recoverExamGrading(aid, user.id));
    return NextResponse.json(await getAttempt(id, user.id, aid));
}));
