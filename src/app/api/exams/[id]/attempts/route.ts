import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { startAttempt } from "@/lib/exam/exam-attempt";
import { attemptKindSchema } from "@/lib/exam/exam-attempt-schema";
import { attemptResponse } from "@/lib/exam/exam-attempt-route";

const schema = z.object({ kind: attemptKindSchema }).strict();
export const POST = withUser(async (req: Request, { user, params }: AuthenticatedContext & { params: Promise<{ id: string }> }) => attemptResponse(async () => {
    const { id } = await params;
    const { kind } = schema.parse(await req.json());
    return NextResponse.json(await startAttempt(id, user.id, kind));
}));
