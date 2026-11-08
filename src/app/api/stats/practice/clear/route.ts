import { NextResponse } from "next/server";
import { syncReviewState } from "@/lib/review-state";
import { scheduleMasteryEvaluation } from "@/lib/mastery";
import { prisma } from "@/lib/prisma";
import { internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";

const logger = createLogger('api:stats:practice:clear');

export const DELETE = withUser(async (_req: Request, { user }: AuthenticatedContext) => {
    const userId = user.id;

    try {
        const { result, ids } = await prisma.$transaction(async db => {
            const affected = await db.practiceRecord.findMany({ where: { userId, errorItemId: { not: null } }, select: { errorItemId: true }, distinct: ['errorItemId'] });
            const ids = affected.flatMap(record => record.errorItemId ? [record.errorItemId] : []);
            const result = await db.practiceRecord.deleteMany({ where: { userId } });
            for (const id of ids) await syncReviewState(db, id);
            return { result, ids };
        }, { timeout: 60_000 });
        if (ids.length) scheduleMasteryEvaluation(ids);

        return NextResponse.json({
            message: "Practice history cleared successfully",
            count: result.count
        });
    } catch (error) {
        logger.error({ error }, 'Error clearing practice stats');
        return internalError("Failed to clear stats");
    }
});
