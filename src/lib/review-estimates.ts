import 'server-only';

import type { Prisma } from '@prisma/client';
import { estimateReviewSeconds } from '@/lib/review-duration';

/** 一次批量读取有效时长，按科目在纯函数内取最近二十条，不逐科请求。 */
export async function getReviewEstimates(db: Prisma.TransactionClient, userId: string) {
    const samples = await db.practiceRecord.findMany({
        where: { userId, source: 'review', durationSec: { gte: 10, lte: 1800 } },
        select: { durationSec: true, createdAt: true, errorItem: { select: { subject: { select: { name: true, subjectKey: true } } } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return estimateReviewSeconds(samples.map(sample => ({ ...sample, subject: sample.errorItem?.subject })));
}
