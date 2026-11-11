import "server-only";

import type { Prisma } from '@prisma/client';
import { getAppTimeZone } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { computeStudentProgress } from '@/lib/student-progress';

/** 不调用会回填调度缓存的队列服务，也不写入任何奖励状态。 */
export async function getStudentProgress(userId: string, masteryThreshold: number, now = new Date(), db: Prisma.TransactionClient = prisma) {
    const items = await db.errorItem.findMany({
        where: { userId },
        select: {
            id: true, subjectId: true, masteryProbability: true, masteryEvaluatedAt: true,
            subject: { select: { name: true, subjectKey: true } },
            tags: { select: { name: true, tagSet: true } },
            practiceRecords: {
                where: { userId },
                select: { id: true, source: true, result: true, createdAt: true },
            },
        },
    });
    const leaveEntries = await db.rewardEntry.findMany({ where: { userId, type: 'leave_use' }, select: { day: true } });
    return computeStudentProgress(items.map(({ subject, practiceRecords, ...item }) => ({
        ...item, subjectName: subject?.name ?? null, subjectKey: subject?.subjectKey ?? null, records: practiceRecords,
    })), masteryThreshold, now, getAppTimeZone(), new Set(leaveEntries.map(entry => entry.day)));
}
