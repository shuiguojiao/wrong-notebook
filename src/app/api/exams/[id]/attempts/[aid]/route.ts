import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import { deleteAttempt, getAttempt } from "@/lib/exam/exam-attempt";
import { attemptResponse } from "@/lib/exam/exam-attempt-route";
import type { AttemptRouteContext } from "@/lib/exam/exam-attempt-route";

export const GET = withUser(async (_req: Request, { user, params }: AttemptRouteContext) => attemptResponse(async () => {
    const { id, aid } = await params;
    return NextResponse.json(await getAttempt(id, user.id, aid));
}));

export const DELETE = withUser(async (_req: Request, { user, params }: AttemptRouteContext) => attemptResponse(async () => {
    const { id, aid } = await params;
    await deleteAttempt(id, user.id, aid);
    return NextResponse.json({ success: true });
}));
