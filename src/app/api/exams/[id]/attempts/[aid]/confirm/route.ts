import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import { confirmAttempt } from "@/lib/exam/exam-attempt";
import { scheduleMasteryEvaluation } from "@/lib/mastery";
import { attemptResponse } from "@/lib/exam/exam-attempt-route";
import type { AttemptRouteContext } from "@/lib/exam/exam-attempt-route";

export const POST = withUser(async (_req: Request, { user, params }: AttemptRouteContext) => attemptResponse(async () => {
    const { id, aid } = await params;
    const affected = await confirmAttempt(id, user.id, aid);
    scheduleMasteryEvaluation(affected);
    return NextResponse.json({ success: true, affectedCount: affected.length });
}));
