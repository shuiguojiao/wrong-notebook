import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import { reviewPhotoAttemptManually } from "@/lib/exam/exam-attempt";
import { attemptResponse } from "@/lib/exam/exam-attempt-route";
import type { AttemptRouteContext } from "@/lib/exam/exam-attempt-route";

export const POST = withUser(async (_req: Request, { user, params }: AttemptRouteContext) => attemptResponse(async () => {
    const { id, aid } = await params;
    return NextResponse.json(await reviewPhotoAttemptManually(id, user.id, aid));
}));
