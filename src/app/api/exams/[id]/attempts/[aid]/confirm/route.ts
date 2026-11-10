import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import { confirmAttempt } from "@/lib/exam/exam-attempt";
import { confirmAttemptSchema } from "@/lib/exam/exam-attempt-schema";
import { scheduleMasteryEvaluation } from "@/lib/mastery";
import { attemptResponse } from "@/lib/exam/exam-attempt-route";
import type { AttemptRouteContext } from "@/lib/exam/exam-attempt-route";

export const POST = withUser(async (req: Request, { user, params }: AttemptRouteContext) => attemptResponse(async () => {
    const { id, aid } = await params;
    const text = await req.text();
    const input = confirmAttemptSchema.parse(text.trim() ? JSON.parse(text) : {});
    const affected = await confirmAttempt(id, user.id, aid, input);
    scheduleMasteryEvaluation(affected);
    return NextResponse.json({ success: true, affectedCount: affected.length });
}));
