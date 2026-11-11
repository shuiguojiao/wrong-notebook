import "server-only";

import type { Prisma, RewardEntry } from '@prisma/client';
import { getAppTimeZone } from '@/lib/config';
import { formatDateTime } from '@/lib/date-time';
import { runSerializedTransaction } from '@/lib/db-write-queue';
import { buildQuestionSummary } from '@/lib/question/question-summary';
import { getReviewQueue } from '@/lib/review-due';
import { getStudentProgress } from '@/lib/student-progress-service';
import { awardsForBadges, REWARD_BADGES } from './badges';
import { pickBraveItem } from './brave';
import { awardsForRecords, REWARD_RULES_VERSION, rewardMeta, settleDerived, shiftDay } from './rules';
import type { Award, RewardRecord } from './rules';
import type { RewardBadgesResponse, RewardEntryResponse, RewardLedgerResponse, RewardSummaryResponse } from '@/types/api';

/** 返回内容限于前端反馈所需的字段。 */
export function rewardEntryResponse(entry: RewardEntry): RewardEntryResponse {
    const { errorItemId, streakDays, badgeId } = rewardMeta(entry.meta);
    return { type: entry.type, points: entry.points, meta: { ...(errorItemId ? { errorItemId } : {}), ...(streakDays ? { streakDays } : {}),
        ...(entry.type === 'badge' && badgeId ? { badgeId } : {}) }, createdAt: entry.createdAt.toISOString() };
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
        const errorItems = await db.errorItem.findMany({ where: { userId }, select: {
            id: true, difficultyStars: true, nextReviewAt: true, questionText: true, ocrText: true, subjectId: true,
            subject: { select: { name: true, subjectKey: true } }, tags: { select: { name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 3 },
        } });
        const todayIds = new Set(queue.entries.map(entry => entry.id));
        let pick = existing.find(entry => entry.type === 'brave_pick' && entry.refKey === `day:${progress.day}`);
        const picked: RewardEntry[] = [];
        if (user.rewardsEnabled && !pick) {
            const candidate = pickBraveItem(errorItems.map(item => ({ ...item,
                masteryStatus: progress.items[item.id].status, inTodayQueue: todayIds.has(item.id) })), now, timeZone);
            if (candidate) {
                picked.push(...await writeAwards(db, userId, [{ day: progress.day, type: 'brave_pick', points: 0,
                    refKey: `day:${progress.day}`, meta: JSON.stringify({ rulesVersion: REWARD_RULES_VERSION, errorItemId: candidate.id }) }]));
                pick = picked[0];
            }
        }
        const inputs: RewardRecord[] = records.map(record => ({ ...record, source: record.examAttempt?.kind === 'manual' ? 'manual' : record.source }));
        const awards = awardsForRecords(inputs, items, existing, timeZone);
        awards.push(...settleDerived(progress, queue.entries.length === 0, queue.todayReviewed, existing, now, timeZone));
        const created = [...picked, ...await writeAwards(db, userId, awards, existing.length === 0)];
        const notebooks = new Map<string, string[]>();
        for (const item of errorItems) {
            if (!item.subjectId) continue;
            const ids = notebooks.get(item.subjectId) ?? [];
            ids.push(item.id);
            notebooks.set(item.subjectId, ids);
        }
        created.push(...await writeAwards(db, userId, awardsForBadges({ records: inputs.map((record, index) => ({ ...record,
            difficultyStars: records[index].errorItem?.difficultyStars ?? null })), existing: [...existing, ...created],
            completedDays: new Set(progress.completedDays), progress, notebooks: [...notebooks].map(([id, itemIds]) => ({ id, itemIds })),
            now, timeZone, firstSettlement: existing.length === 0 })));
        const entries = [...existing, ...created];
        const selected = user.rewardsEnabled && pick ? errorItems.find(item => item.id === rewardMeta(pick.meta).errorItemId) : undefined;
        const lastAnswer = selected ? inputs.filter(record => record.errorItemId === selected.id && record.source === 'review'
            && ['correct', 'wrong'].includes(record.result ?? '') && formatDateTime(record.createdAt, 'yyyy-MM-dd', timeZone) === progress.day).at(-1) : undefined;
        const brave: RewardSummaryResponse['brave'] = selected ? { errorItemId: selected.id, difficultyStars: selected.difficultyStars ?? 3,
            subjectName: selected.subject?.name ?? null, subjectKey: selected.subject?.subjectKey ?? null, tags: selected.tags.map(tag => tag.name),
            preview: buildQuestionSummary(selected.questionText || selected.ocrText, 60).map(part => part.type === 'math' ? `$${part.tex}$` : part.value).join(''),
            done: !!lastAnswer, result: lastAnswer?.result === 'correct' ? 'correct' : lastAnswer ? 'wrong' : null } : null;
        return { created, balance: entries.reduce((sum, entry) => sum + entry.points, 0), entries, progress, user, brave };
    });
}

const DERIVED_TYPES = new Set(['mastered', 'sticker', 'streak', 'done']);

/** 首次回填的派生账目记在结算当天，但它们是历史成果：计入余额，不算作“今天 / 本周所得”。 */
function countsForDay(entry: RewardEntry) {
    return !(DERIVED_TYPES.has(entry.type) && rewardMeta(entry.meta).backfilled);
}

export async function getRewardSummary(userId: string, now = new Date()): Promise<RewardSummaryResponse> {
    const { balance, entries, progress, user, brave } = await settleRewards(userId, now);
    const weekday = new Date(`${progress.day}T12:00:00Z`).getUTCDay();
    const start = shiftDay(progress.day, -((weekday + 6) % 7));
    const today = entries.filter(entry => entry.day === progress.day && countsForDay(entry));
    const week = entries.filter(entry => entry.day >= start && entry.day <= progress.day && countsForDay(entry));
    return { balance, today: { day: progress.day, points: today.reduce((sum, entry) => sum + entry.points, 0), entries: today.map(rewardEntryResponse) },
        week: { start, goalDays: user.weeklyGoalDays, points: week.reduce((sum, entry) => sum + entry.points, 0), completedDays: (progress.completedDays ?? []).filter(day => day >= start && day <= progress.day) },
        streak: progress.streak, reviewedToday: progress.reviewedToday, rulesVersion: REWARD_RULES_VERSION, enabled: user.rewardsEnabled,
        brave, badgeCount: entries.filter(entry => entry.type === 'badge').length,
        recentBadges: entries.filter(entry => entry.type === 'badge' && entry.day >= shiftDay(progress.day, -6) && entry.day <= progress.day && !rewardMeta(entry.meta).backfilled)
            .sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
            .flatMap(entry => { const id = rewardMeta(entry.meta).badgeId; return id ? [{ id, day: entry.day, createdAt: entry.createdAt.toISOString() }] : []; }) };
}

export async function getRewardBadges(userId: string, now = new Date()): Promise<RewardBadgesResponse> {
    const { entries } = await settleRewards(userId, now);
    const earned = new Map(entries.filter(entry => entry.type === 'badge').map(entry => [entry.refKey, entry]));
    return { badges: REWARD_BADGES.map(({ id, category, hidden }) => {
        const entry = earned.get(`badge:${id}`);
        return { id, category, hidden, earned: !!entry, day: entry?.day ?? null, backfilled: entry ? !!rewardMeta(entry.meta).backfilled : false };
    }) };
}

export async function getRewardLedger(userId: string, day: string): Promise<RewardLedgerResponse> {
    const { entries } = await settleRewards(userId);
    const ledger = entries.filter(entry => entry.day === day && countsForDay(entry));
    return { day, points: ledger.reduce((sum, entry) => sum + entry.points, 0), entries: ledger.map(rewardEntryResponse) };
}
