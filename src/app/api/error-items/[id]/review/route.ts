import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withUser } from '@/lib/api-handler';
import { notFound, validationError } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { REVIEW_INTERVALS, reviewKind, reviewPlanOf } from '@/lib/review-schedule';
import { syncReviewState } from '@/lib/review-state';
import type { AuthenticatedContext } from '@/lib/api-handler';

type Context = { params: Promise<{ id: string }> };
const actionSchema = z.object({ action: z.enum(['completed', 'restart']) }).strict();

async function readOrAdjust(req: Request, { user, params }: AuthenticatedContext & Context, adjust: boolean) {
    const { id } = await params;
    const parsed = adjust ? actionSchema.safeParse(await req.json().catch(() => null)) : null;
    if (parsed && !parsed.success) return validationError('无效的复习调整', parsed.error.issues);
    return prisma.$transaction(async db => {
        const item = await db.errorItem.findFirst({ where: { id, userId: user.id }, include: { subject: true } });
        if (!item) return notFound('未找到错题');
        if (parsed?.success) await db.errorItem.update({ where: { id }, data: { reviewOverride: parsed.data.action, reviewOverrideAt: new Date() } });
        const state = parsed?.success || !item.reviewSyncedAt ? await syncReviewState(db, id) : item;
        return NextResponse.json({ ...reviewPlanOf(state), totalRounds: REVIEW_INTERVALS[reviewKind(item)].length });
    });
}

export const GET = withUser<Context>((req, ctx) => readOrAdjust(req, ctx, false));
export const PUT = withUser<Context>((req, ctx) => readOrAdjust(req, ctx, true));
