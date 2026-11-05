import { withUser } from "@/lib/api-handler";
import { notFound } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { serializeWrite } from "@/lib/db-write-queue";

export const DELETE = withUser<{ params: Promise<{ id: string }> }>(async (_req, { user, params }) => {
    const { id } = await params;
    const result = await serializeWrite(() => prisma.agentToken.updateMany({
        where: { id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() },
    }));
    if (!result.count) return notFound();
    return Response.json({ revoked: true });
});
