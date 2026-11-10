import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api-handler";
import { saveAnswer, setFinalResult } from "@/lib/exam/exam-attempt";
import { finalResultSchema, saveAnswerSchema } from "@/lib/exam/exam-attempt-schema";
import { attemptResponse } from "@/lib/exam/exam-attempt-route";
import type { AnswerRouteContext } from "@/lib/exam/exam-attempt-route";

export const PUT = withUser(async (req: Request, { user, params }: AnswerRouteContext) => attemptResponse(async () => {
    const { id, aid, questionId } = await params;
    return NextResponse.json(await saveAnswer(id, user.id, aid, questionId, saveAnswerSchema.parse(await req.json())));
}));

const resultSchema = z.object({ finalResult: finalResultSchema }).strict();
export const PATCH = withUser(async (req: Request, { user, params }: AnswerRouteContext) => attemptResponse(async () => {
    const { id, aid, questionId } = await params;
    const { finalResult } = resultSchema.parse(await req.json());
    return NextResponse.json(await setFinalResult(id, user.id, aid, questionId, finalResult));
}));
