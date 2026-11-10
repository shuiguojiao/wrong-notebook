import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import { submitAttempt } from "@/lib/exam/exam-attempt";
import { submitAttemptSchema } from "@/lib/exam/exam-attempt-schema";
import { attemptResponse } from "@/lib/exam/exam-attempt-route";
import type { AttemptRouteContext } from "@/lib/exam/exam-attempt-route";

export const POST = withUser(async (req: Request, { user, params }: AttemptRouteContext) => attemptResponse(async () => {
    const { id, aid } = await params;
    const raw = await req.text();
    const { durationSec, force } = submitAttemptSchema.parse(raw ? JSON.parse(raw) : {});
    return NextResponse.json(await submitAttempt(id, user.id, aid, durationSec, force));
}));
