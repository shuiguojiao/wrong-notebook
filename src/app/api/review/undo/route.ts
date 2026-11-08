import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withUser } from '@/lib/api-handler';
import { conflict, notFound, validationError } from '@/lib/api-errors';
import { getAppTimeZone } from '@/lib/config';
import { scheduleMasteryEvaluation } from '@/lib/mastery';
import { prisma } from '@/lib/prisma';
import { getReviewPlan } from '@/lib/review-schedule';

const undoSchema = z.object({ recordId: z.string().trim().min(1).max(200) });

/** 撤销只接受本人一分钟内的最后一条复习记录；校验、删除和计划重算在同一事务内完成。 */
export const DELETE = withUser(async (req, { user }) => {
    const parsed = undoSchema.safeParse({ recordId: new URL(req.url).searchParams.get('recordId') });
    if (!parsed.success) return validationError('无效的复习记录', parsed.error.issues);

    const result = await prisma.$transaction(async db => {
        const record = await db.practiceRecord.findFirst({
            where: { id: parsed.data.recordId, userId: user.id, errorItem: { userId: user.id } },
            select: { id: true, source: true, errorItemId: true, createdAt: true },
        });
        if (!record) return { error: notFound('未找到复习记录') };
        const age = Date.now() - record.createdAt.getTime();
        if (record.source !== 'review' || !record.errorItemId || age < 0 || age > 60_000) {
            return { error: conflict('只能撤销刚刚保存的复习结果') };
        }
        const latest = await db.practiceRecord.findFirst({
            where: { userId: user.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true },
        });
        if (latest?.id !== record.id) return { error: conflict('已有新的作答记录，无法撤销') };
        await db.practiceRecord.delete({ where: { id: record.id } });
        const item = await db.errorItem.findUniqueOrThrow({
            where: { id: record.errorItemId },
            select: { createdAt: true, practiceRecords: { select: { result: true, createdAt: true } } },
        });
        return { errorItemId: record.errorItemId, reviewPlan: getReviewPlan(item.createdAt, item.practiceRecords, getAppTimeZone()) };
    });
    if (result.error) return result.error;
    scheduleMasteryEvaluation([result.errorItemId]);
    return NextResponse.json({ success: true, reviewPlan: result.reviewPlan });
});
