import "server-only";

import type { Prisma, User } from "@prisma/client";
import { runSerializedTransaction } from "@/lib/db-write-queue";
import { createLogger } from "@/lib/logger";
import { syncReviewState } from "@/lib/review-state";
import { prisma } from "@/lib/prisma";
import { computeRuleMastery, isPracticeResult, masteryLevelFor } from "@/lib/mastery";
import { AgentInputError, validateAgentInput } from "@/lib/agent/errors";
import { checkedAgentSvg, prepareAgentPatchImage } from "@/lib/agent/mutations";
import { agentItemResponse, checkAgentRevision, loadAgentItem } from "@/lib/agent/queries";
import type { AgentItemDetail } from "@/lib/agent/queries";
import { agentDeleteRecordSchema, agentUpdateRecordSchema } from "@/lib/agent/schema";

const logger = createLogger("agent-record-edit");

function importedRecord(item: AgentItemDetail, recordId: string, userId: string) {
    const record = item.practiceRecords.find((entry) => entry.id === recordId && entry.userId === userId);
    if (!record) throw new AgentInputError("AGENT_RECORD_NOT_FOUND", 404);
    // 试卷与练习记录有独立业务关联，本工具只纠正重复导入产生的记录。
    if (record.source !== "duplicate_import" || record.examQuestionId) throw new AgentInputError("AGENT_RECORD_NOT_EDITABLE", 400);
    return record;
}

async function refreshRuleMastery(tx: Prisma.TransactionClient, user: User, id: string) {
    const records = await tx.practiceRecord.findMany({ where: { errorItemId: id, userId: user.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const history = records.flatMap((entry) => isPracticeResult(entry.result) ? [{ result: entry.result, difficulty: entry.difficulty }] : []);
    const probability = computeRuleMastery(history);
    await tx.errorItem.update({ where: { id }, data: {
        masteryProbability: probability,
        masteryLevel: probability === null ? 0 : masteryLevelFor(probability, user.masteryThreshold),
        masterySource: probability === null ? null : "rule",
        masteryReason: probability === null ? null : `共练习 ${history.length} 次，做对 ${history.filter((entry) => entry.result === "correct").length} 次（规则估算）`,
        masteryEvaluatedAt: probability === null ? null : new Date(),
    } });
}

export async function updateAgentErrorRecord(user: User, input: unknown, origin: string) {
    const { id, expectedRevision, recordId, patch } = validateAgentInput(agentUpdateRecordSchema.safeParse(input));
    const initial = await prisma.$transaction((tx) => loadAgentItem(tx, user.id, id));
    checkAgentRevision(initial, expectedRevision);
    importedRecord(initial, recordId, user.id);
    const image = await prepareAgentPatchImage(patch.image);
    const svg = patch.figureSvg !== undefined ? checkedAgentSvg(patch.figureSvg) : undefined;
    const result = await runSerializedTransaction(async (tx) => {
        const item = await loadAgentItem(tx, user.id, initial.id);
        checkAgentRevision(item, expectedRevision);
        importedRecord(item, recordId, user.id);
        const data: Prisma.PracticeRecordUncheckedUpdateInput = {};
        for (const key of ["questionText", "answerText", "analysis", "wrongAnswerText", "mistakeAnalysis", "notes", "result"] as const) {
            if (patch[key] !== undefined) Object.assign(data, { [key]: patch[key] });
        }
        if (patch.result !== undefined) data.isCorrect = patch.result === "correct";
        if (image !== undefined) data.originalImageUrl = image || null;
        if (svg !== undefined) data.figureSvg = svg;
        await tx.practiceRecord.update({ where: { id: recordId }, data });
        await syncReviewState(tx, item.id);
        await refreshRuleMastery(tx, user, item.id);
        return { recordId, item: agentItemResponse(await loadAgentItem(tx, user.id, item.id), origin) };
    });
    logger.info({ userId: user.id, recordId, fields: Object.keys(patch) }, "代理纠正导入记录完成");
    return result;
}

export async function deleteAgentErrorRecord(user: User, input: unknown, origin: string) {
    const { id, expectedRevision, recordId } = validateAgentInput(agentDeleteRecordSchema.safeParse(input));
    const result = await runSerializedTransaction(async (tx) => {
        const item = await loadAgentItem(tx, user.id, id);
        checkAgentRevision(item, expectedRevision);
        importedRecord(item, recordId, user.id);
        await tx.practiceRecord.delete({ where: { id: recordId } });
        await syncReviewState(tx, item.id);
        await refreshRuleMastery(tx, user, item.id);
        return { recordId, deleted: true, item: agentItemResponse(await loadAgentItem(tx, user.id, item.id), origin) };
    });
    logger.info({ userId: user.id, recordId }, "代理撤销重复导入记录完成");
    return result;
}
