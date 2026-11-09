import { NextResponse } from "next/server";
import { AgentInputError } from "@/lib/agent/errors";
import { withUser } from "@/lib/api-handler";
import { badRequest, createErrorResponse } from "@/lib/api-errors";
import { resolveCheckSchema, resolveQuestionCheck } from "@/lib/question/resolve-check";

export const POST = withUser<{ params: Promise<{ errorItemId: string }> }>(async (req, { user, params }) => {
    const parsed = resolveCheckSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("CHECK_INVALID_ACTION");
    try {
        return NextResponse.json(await resolveQuestionCheck(user, (await params).errorItemId, parsed.data));
    } catch (error) {
        if (error instanceof AgentInputError) return createErrorResponse(error.message, error.status);
        throw error;
    }
});
