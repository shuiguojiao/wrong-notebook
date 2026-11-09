import "server-only";

import { runSerializedTransaction } from "@/lib/db-write-queue";
import { getErrorMessage } from "@/lib/error-message";
import { createLogger } from "@/lib/logger";
import { CHECK_VERSION } from "@/lib/question/check-rules";
import { checkContext, withCheckContext } from "@/lib/question/check-metadata";
import { checkSavedQuestion, parseCheckIssues } from "@/lib/question/check-store";
import { scheduleIntegrityCheck } from "@/lib/question/integrity-queue";
import { surfaceLegacyIssues } from "@/lib/question/legacy-surface";

const logger = createLogger("legacy-question-check");

/** 判定保存后或详情归属校验后调用；事务内再次判版本，避免并发重复检查。 */
export async function checkLegacyQuestion(id: string, userId: string, rulesOnly = false): Promise<boolean> {
    try {
        const result = await runSerializedTransaction(async tx => {
            const item = await tx.errorItem.findFirst({ where: { id, userId }, include: { questionRegions: { select: { id: true }, take: 1 } } });
            if (!item || (item.checkedAt && (item.checkVersion ?? 0) >= CHECK_VERSION)) return null;
            const issues = parseCheckIssues(item.checkIssues);
            if (!checkContext(issues)) await tx.errorItem.update({ where: { id }, data: { checkIssues: JSON.stringify(withCheckContext(issues, {
                origin: "legacy", observedAt: new Date().toISOString(),
                ...(issues.some(issue => issue.visibility === "user" && !issue.dismissed && !issue.resolved) ? { surfacedAt: (item.checkedAt ?? new Date()).toISOString() } : {}),
            })), updatedAt: item.updatedAt } });
            const result = await checkSavedQuestion(id, tx);
            if (!result) return null;
            const checkIssues = await surfaceLegacyIssues(tx, userId, result.checkIssues ?? "[]");
            await tx.errorItem.update({ where: { id }, data: { checkIssues, updatedAt: item.updatedAt } });
            return { hasImage: !!item.originalImageUrl || item.questionRegions.length > 0 };
        });
        if (result?.hasImage && !rulesOnly) scheduleIntegrityCheck(id);
        return result !== null;
    } catch (error) {
        logger.warn({ errorItemId: id, error: getErrorMessage(error) }, "存量检查失败，原流程继续");
        return false;
    }
}
