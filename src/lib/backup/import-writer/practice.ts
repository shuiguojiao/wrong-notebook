import "server-only";

/**
 * 导入步骤：练习记录与掌握阈值同步。
 */
import { storeImage } from "@/lib/image-storage";
import { sanitizeFigureSvg } from "@/lib/figure-svg";
import { syncMasteryLevels } from "@/lib/mastery";
import type { ImportContext } from "./types";

/** 7. 导入 practice records */
export async function importPracticeRecords(ctx: ImportContext): Promise<void> {
    const { tx, user, importAll, normalized, stats, masteryIds, evaluatedIds, errorItemIdMap, errorItemOwnerMap, examQuestionIdMap, examQuestionOwnerMap } = ctx;
    const rewardedRefs = new Set(normalized.data.rewardEntries?.map(entry => JSON.stringify([entry.userId, entry.refKey])));
    for (const record of normalized.practiceRecords) {
        const { raw } = record;
        const targetUserId = importAll ? raw.userId : user.id;
        const errorItemId = raw.errorItemId && errorItemOwnerMap.get(raw.errorItemId) === targetUserId
            ? errorItemIdMap.get(raw.errorItemId) : undefined;
        const examQuestionId = raw.examQuestionId && examQuestionOwnerMap.get(raw.examQuestionId) === targetUserId
            ? examQuestionIdMap.get(raw.examQuestionId) : undefined;
        // 已记账的第 20 版记录按 ID 复用，避免重复导入生成可再次领奖的副本。
        const rewarded = rewardedRefs.has(JSON.stringify([raw.userId, `record:${raw.id}`]));
        const existing = rewarded ? await tx.practiceRecord.findFirst({ where: { id: raw.id, userId: targetUserId } }) : null;
        if (existing) { ctx.practiceRecordIdMap.set(raw.id, existing.id); continue; }
        const keepId = normalized.data.version >= 16 && !(await tx.practiceRecord.findUnique({ where: { id: raw.id }, select: { id: true } }));
        const created = await tx.practiceRecord.create({
            data: {
                ...(keepId ? { id: raw.id } : {}),
                userId: targetUserId,
                subject: raw.subject,
                difficulty: raw.difficulty,
                isCorrect: raw.isCorrect,
                source: record.source,
                result: record.result,
                durationSec: normalized.data.version >= 16 && (record.source === 'review' || (normalized.data.version >= 18 && record.source === 'exam')) ? raw.durationSec ?? null : null,
                confidence: normalized.data.version >= 16 && raw.confidence === 'sure' ? 'sure' : raw.confidence === 'unsure' ? 'unsure' : null,
                answerImageUrl: raw.answerImageUrl ? await storeImage(raw.answerImageUrl) : null,
                examAttemptId: raw.examAttemptId ? ctx.examAttemptIdMap.get(raw.examAttemptId) : undefined,
                recognizedAnswer: raw.recognizedAnswer ?? null,
                ...(errorItemId ? {
                    errorItemId,
                    questionText: raw.questionText,
                    answerText: raw.answerText,
                    analysis: raw.analysis,
                    wrongAnswerText: raw.wrongAnswerText,
                    notes: typeof raw.notes === "string" ? raw.notes : null,
                    gradeReason: typeof raw.gradeReason === "string" ? raw.gradeReason : null,
                    mistakeAnalysis: raw.mistakeAnalysis,
                    originalImageUrl: raw.originalImageUrl ? await storeImage(raw.originalImageUrl) : raw.originalImageUrl,
                    figureSvg: sanitizeFigureSvg(raw.figureSvg),
                    examQuestionId,
                } : {}),
                createdAt: record.createdAt,
            },
        });
        ctx.practiceRecordIdMap.set(raw.id, created.id);
        stats.practiceRecordsCreated++;
        if (errorItemId && record.result && !evaluatedIds.has(errorItemId)) masteryIds.add(errorItemId);
    }
}

/** 9. 还原了已掌握阈值时，按新阈值同步该账户全部错题的 masteryLevel */
export async function syncMasteryThreshold(ctx: ImportContext): Promise<void> {
    const { tx, user, normalized } = ctx;
    if (typeof normalized.preferences.masteryThreshold === 'number') {
        await syncMasteryLevels(tx, user.id, normalized.preferences.masteryThreshold);
    }
}
