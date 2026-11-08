import 'server-only';

import type { Prisma } from '@prisma/client';
import { getAppTimeZone } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { rebuildReviewState } from '@/lib/review-schedule';

const reviewSelect = {
    id: true, createdAt: true, updatedAt: true, questionType: true, reviewOverride: true, reviewOverrideAt: true,
    subject: { select: { name: true, subjectKey: true } },
    practiceRecords: { select: { id: true, result: true, confidence: true, createdAt: true } },
} satisfies Prisma.ErrorItemSelect;
type ReviewRow = Prisma.ErrorItemGetPayload<{ select: typeof reviewSelect }>;

async function writeReviewState(db: Prisma.TransactionClient, item: ReviewRow, timeZone: string) {
    const overrides = item.reviewOverrideAt && (item.reviewOverride === 'completed' || item.reviewOverride === 'restart')
        ? [{ action: item.reviewOverride, at: item.reviewOverrideAt }] as const : [];
    const state = rebuildReviewState(item, item.practiceRecords, overrides, timeZone);
    // 重放是缓存维护，不改业务修订时间，避免懒迁移干扰 Agent 乐观锁和题目排序。
    await db.errorItem.update({ where: { id: item.id }, data: { ...state, reviewSyncedAt: new Date(), updatedAt: item.updatedAt } });
    return state;
}

/** 由所有作答记录变更路径在原写事务中调用。 */
export async function syncReviewState(db: Prisma.TransactionClient, itemId: string, timeZone = getAppTimeZone()) {
    const item = await db.errorItem.findUniqueOrThrow({ where: { id: itemId }, select: reviewSelect });
    return writeReviewState(db, item, timeZone);
}

/** 分批、幂等重放；每批读取历史及回写在同一事务内，正式迁移后无需额外上线步骤。 */
export async function backfillReviewStates(where: Prisma.ErrorItemWhereInput, onlyUnsynced = true, timeZone = getAppTimeZone()) {
    let cursor: string | undefined;
    let count = 0;
    while (true) {
        const page = await prisma.$transaction(async db => {
            const items = await db.errorItem.findMany({
                where: { AND: [where, ...(onlyUnsynced ? [{ reviewSyncedAt: null }] : []), ...(cursor ? [{ id: { gt: cursor } }] : [])] },
                select: reviewSelect, orderBy: { id: 'asc' }, take: 100,
            });
            for (const item of items) await writeReviewState(db, item, timeZone);
            return items;
        }, { timeout: 60_000 });
        count += page.length;
        if (page.length < 100) return count;
        cursor = page.at(-1)!.id;
    }
}
