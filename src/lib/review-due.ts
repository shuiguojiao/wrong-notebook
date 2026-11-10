import 'server-only';

import { getAppTimeZone } from '@/lib/config';
import { formatDateTime, getDayRange } from '@/lib/date-time';
import { prisma } from '@/lib/prisma';
import { reviewSeconds } from '@/lib/review-duration';
import { getReviewEstimates } from '@/lib/review-estimates';
import { extraReviewQueue, hasReviewBacklog, sortReviewQueue, takeReviewBudget } from '@/lib/review-queue';
import { backfillReviewStates } from '@/lib/review-state';
import { reviewPlanOf } from '@/lib/review-schedule';

/** 首页、会话和提醒共用同一额度快照；科目筛选只扣该科今天的复习记录。 */
export async function getReviewQueue(userId: string, subjectId?: string, mode: 'today' | 'extra' = 'today', now = new Date(), timeZone = getAppTimeZone()) {
    const scope = { userId, ...(subjectId ? { subjectId } : {}) };
    await backfillReviewStates(scope, true, timeZone);
    return prisma.$transaction(async db => {
        const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { reviewDailyMinutes: true } });
        const estimates = await getReviewEstimates(db, userId);
        const today = getDayRange(now, timeZone);
        const items = await db.errorItem.findMany({
            where: { ...scope, reviewCompletedAt: null, nextReviewAt: { lt: getDayRange(now, timeZone, 3).end } },
            select: { id: true, subjectId: true, questionType: true, reviewStage: true, reviewWrongStreak: true,
                nextReviewAt: true, reviewCompletedAt: true, subject: { select: { name: true, subjectKey: true } } },
        });
        const records = await db.practiceRecord.findMany({
            where: { userId, source: 'review', createdAt: { gte: today.start, lt: today.end },
                errorItem: { is: { ...(subjectId ? { subjectId } : {}), userId } } },
            select: { errorItemId: true, durationSec: true, errorItem: { select: { subjectId: true, subject: { select: { name: true, subjectKey: true } } } } },
        });
        const consumedSec = records.reduce((sum, record) => sum + reviewSeconds(record.errorItem?.subject, estimates), 0);
        const todayDurationSec = records.reduce((sum, record) => sum + (record.durationSec ?? 0), 0);
        const candidates = items.flatMap(item => item.nextReviewAt ? [{ ...item, nextReviewAt: item.nextReviewAt, estimatedSec: reviewSeconds(item.subject, estimates) }] : []);
        const due = sortReviewQueue(candidates.filter(item => item.nextReviewAt < today.end), now, timeZone);
        const dailyMinutes = user.reviewDailyMinutes;
        const remainingSec = Math.max(0, dailyMinutes * 60 - consumedSec);
        const todayQueue = takeReviewBudget(due, remainingSec, records.length === 0);
        const todayIds = new Set(todayQueue.map(item => item.id));
        const backlogSec = due.filter(item => !todayIds.has(item.id)).reduce((sum, item) => sum + item.estimatedSec, 0);
        const queue = mode === 'extra' ? extraReviewQueue(due, candidates, now, timeZone) : todayQueue;
        const tomorrowEnd = getDayRange(now, timeZone, 1).end;
        const tomorrowSec = Math.min(dailyMinutes * 60, candidates.filter(item => item.nextReviewAt >= today.end && item.nextReviewAt < tomorrowEnd).reduce((sum, item) => sum + item.estimatedSec, 0));
        // 同日重复作答只计一道已做题；勾选仅依据当前额度队列中该科已无剩余题。
        const reviewed = new Map<string, { subjectId: string | null; subjectName: string | null; ids: Set<string> }>();
        for (const record of records) {
            if (!record.errorItem || !record.errorItemId) continue;
            const subjectId = record.errorItem.subjectId;
            const key = subjectId ?? '';
            const group = reviewed.get(key) ?? { subjectId, subjectName: record.errorItem.subject?.name ?? null, ids: new Set<string>() };
            group.ids.add(record.errorItemId);
            reviewed.set(key, group);
        }
        return {
            reviewedSubjects: [...reviewed.values()].map(({ ids, ...subject }) => ({ ...subject, count: ids.size })),
            entries: queue.map(item => ({ id: item.id, estimatedSec: item.estimatedSec, subjectId: item.subjectId,
                subjectName: item.subject?.name ?? null, plan: reviewPlanOf(item) })),
            dayKey: `${userId}:${formatDateTime(now, 'yyyy-MM-dd', timeZone)}`,
            dailyMinutes, consumedMinutes: consumedSec / 60, remainingMinutes: remainingSec / 60,
            estimatedMinutes: queue.reduce((sum, item) => sum + item.estimatedSec, 0) / 60,
            tomorrowMinutes: tomorrowSec / 60, todayDurationSec, todayReviewed: records.length,
            backlogHint: hasReviewBacklog(backlogSec, dailyMinutes),
        };
    });
}

export async function getDueReviews(userId: string, subjectId?: string, now = new Date(), timeZone = getAppTimeZone()) {
    return (await getReviewQueue(userId, subjectId, 'today', now, timeZone)).entries;
}

export async function getDueReviewSummary(userId: string, now = new Date(), timeZone = getAppTimeZone()) {
    const queue = await getReviewQueue(userId, undefined, 'today', now, timeZone);
    const subjects: Record<string, number> = Object.create(null);
    for (const item of queue.entries) {
        const name = item.subjectName ?? '未分类';
        subjects[name] = (subjects[name] ?? 0) + 1;
    }
    return { total: queue.entries.length, subjects, estimatedMinutes: queue.estimatedMinutes };
}
