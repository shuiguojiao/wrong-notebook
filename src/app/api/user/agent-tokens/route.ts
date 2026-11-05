import { z } from "zod";
import { withUser } from "@/lib/api-handler";
import { conflict, validationError } from "@/lib/api-errors";
import { agentTokenSelect, createAgentToken } from "@/lib/agent-token";
import { prisma } from "@/lib/prisma";

const schema = z.object({
    name: z.string().trim().min(1).max(100),
    expiresAt: z.iso.datetime().refine((value) => new Date(value) > new Date()).optional(),
});

export const GET = withUser(async (_req, { user }) => {
    const tokens = await prisma.agentToken.findMany({
        where: { userId: user.id }, select: agentTokenSelect, orderBy: { createdAt: "desc" },
    });
    return Response.json({ tokens }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withUser(async (req, { user }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError("AGENT_TOKEN_INVALID_INPUT");
    const token = await createAgentToken(user.id, parsed.data.name, parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined);
    if (!token) return conflict("AGENT_TOKEN_LIMIT_REACHED");
    return Response.json(token, { status: 201, headers: { "Cache-Control": "no-store" } });
});
