import 'server-only';

import type { Prisma } from '@prisma/client';
import { getAppTimeZone } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { REVIEW_INTERVALS, REVIEW_WINDOWS, rebuildReviewTimeline, reviewKind } from '@/lib/review-schedule';
import { selectReviewDate } from '@/lib/review-load';
import { reviewSeconds } from '@/lib/review-duration';
import { getReviewEstimates } from '@/lib/review-estimates';
import { getDayRange, shiftCalendarDate } from '@/lib/date-time';

const reviewSelect = {
    id: true, userId: true, createdAt: true, updatedAt: true, questionType: true, reviewOverride: true, reviewOverrideAt: true,
    subject: { select: { name: true, subjectKey: true } },
    practiceRecords: { select: { id: true, result: true, confidence: true, createdAt: true } },
} satisfies Prisma.ErrorItemSelect;
type ReviewRow = Prisma.ErrorItemGetPayload<{ select: typeof reviewSelect }>;

async function writeReviewState(db: Prisma.TransactionClient, item: ReviewRow, timeZone: string, cachedEstimates?: ReadonlyMap<string, number>) {
    const overrides = item.reviewOverrideAt && (item.reviewOverride === 'completed' || item.reviewOverride === 'restart')
        ? [{ action: item.reviewOverride, at: item.reviewOverrideAt }] as const : [];
    const { state, anchor } = rebuildReviewTimeline(item, item.practiceRecords, overrides, timeZone);
    if (anchor && state.nextReviewAt) {
        const kind = reviewKind(item);
        const [min, max] = REVIEW_WINDOWS[REVIEW_INTERVALS[kind][state.reviewStage]];
        const estimates = cachedEstimates ?? await getReviewEstimates(db, item.userId);
        const loads = await db.errorItem.findMany({
            where: { userId: item.userId, id: { not: item.id }, reviewCompletedAt: null,
                nextReviewAt: { gte: getDayRange(shiftCalendarDate(anchor, timeZone, min), timeZone).start,
                    lt: getDayRange(shiftCalendarDate(anchor, timeZone, max), timeZone).end } },
            select: { id: true, nextReviewAt: true, subject: { select: { name: true, subjectKey: true } } },
        });
        state.nextReviewAt = selectReviewDate(item.id, state.reviewStage, kind, anchor,
            loads.flatMap(row => row.nextReviewAt ? [{ id: row.id, nextReviewAt: row.nextReviewAt, estimatedSec: reviewSeconds(row.subject, estimates) }] : []), timeZone);
    }
    // 重放是缓存维护，不改业务修订时间，避免懒迁移干扰 Agent 乐观锁和题目排序。
    await db.errorItem.update({ where: { id: item.id }, data: { ...state, reviewSyncedAt: new Date(), updatedAt: item.updatedAt } });
    return state;
}

/** 由所有作答记录变更路径在原写事务中调用。 */
export async function syncReviewState(db: Prisma.TransactionClient, itemId: string, timeZone = getAppTimeZone()) {
    const item = await db.errorItem.findUniqueOrThrow({ where: { id: itemId }, select: reviewSelect });
    return writeReviewState(db, item, timeZone);
}

/** 先恢复哈希基线，再按用户、基线到期日、ID 做负载选日；全量回填可重复得到同一安排。 */
export async function syncReviewStates(db: Prisma.TransactionClient, where: Prisma.ErrorItemWhereInput, timeZone = getAppTimeZone()) {
    const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
    const items = await db.errorItem.findMany({ where, select: reviewSelect });
    const baseline = items.map(item => {
        const overrides = item.reviewOverrideAt && (item.reviewOverride === 'completed' || item.reviewOverride === 'restart')
            ? [{ action: item.reviewOverride, at: item.reviewOverrideAt }] as const : [];
        return { item, state: rebuildReviewTimeline(item, item.practiceRecords, overrides, timeZone).state };
    }).sort((a, b) => compareId(a.item.userId, b.item.userId)
        || (a.state.nextReviewAt?.getTime() ?? Infinity) - (b.state.nextReviewAt?.getTime() ?? Infinity)
        || compareId(a.item.id, b.item.id));
    for (const { item, state } of baseline) await db.errorItem.update({ where: { id: item.id }, data: { ...state, updatedAt: item.updatedAt } });
    const estimates = new Map<string, ReadonlyMap<string, number>>();
    for (const { item } of baseline) {
        if (!estimates.has(item.userId)) estimates.set(item.userId, await getReviewEstimates(db, item.userId));
        await writeReviewState(db, item, timeZone, estimates.get(item.userId));
    }
    return items.length;
}

/** 同一用户的旧题成组初始化，避免分页边界改变负载选日顺序；用户之间分事务。 */
export async function backfillReviewStates(where: Prisma.ErrorItemWhereInput, onlyUnsynced = true, timeZone = getAppTimeZone()) {
    const scope = { AND: [where, ...(onlyUnsynced ? [{ reviewSyncedAt: null }] : [])] };
    const users = await prisma.errorItem.findMany({ where: scope, select: { userId: true }, distinct: ['userId'] });
    let count = 0;
    for (const { userId } of users) {
        count += await prisma.$transaction(db => syncReviewStates(db, { AND: [scope, { userId }] }, timeZone), { timeout: 60_000 });
    }
    return count;
}
