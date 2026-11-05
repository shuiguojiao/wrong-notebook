import "server-only";

import { getAppTimeZone } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { getReviewPlan, isReviewDue } from "@/lib/review-schedule";

/** 列表与提醒共用到期算法；按最早到期排序。 */
export async function getDueReviews(userId: string, subjectId?: string, now = new Date(), timeZone = getAppTimeZone()) {
    // 先只取计算计划所需的字段，到期的再查询完整内容
    const candidates = await prisma.errorItem.findMany({
        where: { userId, ...(subjectId ? { subjectId } : {}) },
        select: {
            id: true,
            createdAt: true,
            practiceRecords: { where: { result: { not: null } }, select: { result: true, createdAt: true } },
        },
    });

    return candidates
        .map((item) => ({ id: item.id, plan: getReviewPlan(item.createdAt, item.practiceRecords, timeZone) }))
        .filter(({ plan }) => isReviewDue(plan, timeZone, now))
        .sort((a, b) => a.plan.nextReviewAt!.getTime() - b.plan.nextReviewAt!.getTime());
}

/** 按科目汇总全部到期题目，不受列表分页影响。 */
export async function getDueReviewSummary(userId: string, now = new Date(), timeZone = getAppTimeZone()) {
    const due = await getDueReviews(userId, undefined, now, timeZone);
    const items = await prisma.errorItem.findMany({
        where: { userId, id: { in: due.map(({ id }) => id) } },
        select: { subject: { select: { name: true } } },
    });
    const subjects: Record<string, number> = Object.create(null);
    for (const item of items) {
        const name = item.subject?.name ?? "未分类";
        subjects[name] = (subjects[name] ?? 0) + 1;
    }
    return { total: items.length, subjects };
}
