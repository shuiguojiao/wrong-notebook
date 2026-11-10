import { withUser } from "@/lib/api-handler";
import { notFound } from "@/lib/api-errors";
import { readStoredImage } from "@/lib/image-storage";
import { prisma } from "@/lib/prisma";
import { attemptResponse } from "@/lib/exam/exam-attempt-route";
import type { AnswerRouteContext } from "@/lib/exam/exam-attempt-route";

export const GET = withUser(async (_req: Request, { user, params }: AnswerRouteContext) => attemptResponse(async () => {
    const { id, aid, questionId } = await params;
    const answer = await prisma.examAttemptAnswer.findFirst({
        where: { attemptId: aid, examQuestionId: questionId, examQuestion: { paperId: id }, attempt: { paperId: id, userId: user.id, paper: { userId: user.id } } },
        select: { answerImageUrl: true },
    });
    if (!answer?.answerImageUrl) return notFound('Image not found');
    const image = await readStoredImage(answer.answerImageUrl);
    if (!image) return notFound('Image not found');
    return new Response(new Uint8Array(image.bytes), { headers: { 'Content-Type': image.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}));
