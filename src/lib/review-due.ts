import 'server-only';

import { getAppTimeZone } from '@/lib/config';
import { getDayRange } from '@/lib/date-time';
import { prisma } from '@/lib/prisma';
import { backfillReviewStates } from '@/lib/review-state';
import { reviewPlanOf } from '@/lib/review-schedule';

/** 列表、首页和提醒共用持久化到期日；仅首次读取时批量初始化旧题。 */
export async function getDueReviews(userId: string, subjectId?: string, now = new Date(), timeZone = getAppTimeZone()) {
    const scope = { userId, ...(subjectId ? { subjectId } : {}) };
    await backfillReviewStates(scope, true, timeZone);
    const items = await prisma.errorItem.findMany({
        where: { ...scope, reviewCompletedAt: null, nextReviewAt: { lt: getDayRange(now, timeZone).end } },
        select: { id: true, reviewStage: true, reviewWrongStreak: true, nextReviewAt: true, reviewCompletedAt: true },
        orderBy: [{ nextReviewAt: 'asc' }, { id: 'asc' }],
    });
    return items.map(item => ({ id: item.id, plan: reviewPlanOf(item) }));
}

/** 第一期仍统计全部到期题，不引入第二期的分钟额度。 */
export async function getDueReviewSummary(userId: string, now = new Date(), timeZone = getAppTimeZone()) {
    const due = await getDueReviews(userId, undefined, now, timeZone);
    const items = await prisma.errorItem.findMany({
        where: { userId, id: { in: due.map(({ id }) => id) } },
        select: { subject: { select: { name: true } } },
    });
    const subjects: Record<string, number> = Object.create(null);
    for (const item of items) {
        const name = item.subject?.name ?? '未分类';
        subjects[name] = (subjects[name] ?? 0) + 1;
    }
    return { total: items.length, subjects };
}
