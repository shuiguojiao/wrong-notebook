import "server-only";

import type { Prisma, RewardEntry } from '@prisma/client';
import { getAppTimeZone } from '@/lib/config';
import { runSerializedTransaction } from '@/lib/db-write-queue';
import { getReviewQueue } from '@/lib/review-due';
import { getStudentProgress } from '@/lib/student-progress-service';
import { awardsForRecords, REWARD_RULES_VERSION, rewardMeta, settleDerived, shiftDay } from './rules';
import type { Award, RewardRecord } from './rules';
import type { RewardEntryResponse, RewardLedgerResponse, RewardSummaryResponse } from '@/types/api';

/** 返回内容限于前端反馈所需的字段。 */
export function rewardEntryResponse(entry: RewardEntry): RewardEntryResponse {
    const errorItemId = rewardMeta(entry.meta).errorItemId;
    return { type: entry.type, points: entry.points, meta: errorItemId ? { errorItemId } : {}, createdAt: entry.createdAt.toISOString() };
}

async function writeAwards(db: Prisma.TransactionClient, userId: string, awards: readonly Award[], backfilled = false) {
    const created: RewardEntry[] = [];
    for (const award of awards) {
        created.push(await db.rewardEntry.create({ data: { ...award, userId,
            meta: backfilled ? JSON.stringify({ ...rewardMeta(award.meta), backfilled: true }) : award.meta } }));
    }
    return created;
}

/** 即时记账与保存共用事务，不能再次进入写入队列。 */
export async function recordRewardsForPractice(db: Prisma.TransactionClient, userId: string, recordId: string) {
    const record = await db.practiceRecord.findFirstOrThrow({ where: { id: recordId, userId }, include: { errorItem: true, examAttempt: { select: { kind: true } } } });
    const previousRecords = record.errorItemId ? await db.practiceRecord.findMany({
        where: { userId, errorItemId: record.errorItemId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }) : [];
    const existing = await db.rewardEntry.findMany({ where: { userId } });
    const items = new Map(record.errorItem ? [[record.errorItem.id, { difficultyStars: record.errorItem.difficultyStars, previousRecords }]] : []);
    const input = { ...record, source: record.examAttempt?.kind === 'manual' ? 'manual' : record.source };
    return writeAwards(db, userId, awardsForRecords([input], items, existing, getAppTimeZone()));
}

export async function removeRewardsForRecord(db: Prisma.TransactionClient, userId: string, recordId: string) {
    return db.rewardEntry.deleteMany({ where: { userId, refKey: `record:${recordId}` } });
}

/** 读、推算与写入处于同一个串行事务，失败时整批回滚。 */
export async function settleRewards(userId: string, now = new Date()) {
    return runSerializedTransaction(async db => {
        const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
        const records = await db.practiceRecord.findMany({ where: { userId, createdAt: { lte: now } },
            include: { errorItem: { select: { difficultyStars: true } }, examAttempt: { select: { kind: true } } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        const existing = await db.rewardEntry.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        const items = new Map(records.flatMap(record => record.errorItemId && record.errorItem ? [[record.errorItemId, record.errorItem] as const] : []));
        const timeZone = getAppTimeZone();
        const progress = await getStudentProgress(userId, user.masteryThreshold, now, db);
        const queue = await getReviewQueue(userId, undefined, 'today', now, timeZone, db);
        const inputs: RewardRecord[] = records.map(record => ({ ...record, source: record.examAttempt?.kind === 'manual' ? 'manual' : record.source }));
        const awards = awardsForRecords(inputs, items, existing, timeZone);
        awards.push(...settleDerived(progress, queue.entries.length === 0, queue.todayReviewed, existing, now, timeZone));
        const created = await writeAwards(db, userId, awards, existing.length === 0);
        const entries = [...existing, ...created];
        return { created, balance: entries.reduce((sum, entry) => sum + entry.points, 0), entries, progress, user };
    });
}

export async function getRewardSummary(userId: string, now = new Date()): Promise<RewardSummaryResponse> {
    const { balance, entries, progress, user } = await settleRewards(userId, now);
    const weekday = new Date(`${progress.day}T12:00:00Z`).getUTCDay();
    const start = shiftDay(progress.day, -((weekday + 6) % 7));
    const today = entries.filter(entry => entry.day === progress.day);
    return { balance, today: { day: progress.day, points: today.reduce((sum, entry) => sum + entry.points, 0), entries: today.map(rewardEntryResponse) },
        week: { start, goalDays: user.weeklyGoalDays, completedDays: (progress.completedDays ?? []).filter(day => day >= start && day <= progress.day) },
        streak: progress.streak, reviewedToday: progress.reviewedToday, rulesVersion: REWARD_RULES_VERSION, enabled: user.rewardsEnabled };
}

export async function getRewardLedger(userId: string, day: string): Promise<RewardLedgerResponse> {
    const { entries } = await settleRewards(userId);
    const ledger = entries.filter(entry => entry.day === day);
    return { day, points: ledger.reduce((sum, entry) => sum + entry.points, 0), entries: ledger.map(rewardEntryResponse) };
}
