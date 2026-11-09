import "server-only";

import type { ErrorItem, Prisma } from "@prisma/client";
import { runSerializedTransaction } from "@/lib/db-write-queue";
import { getErrorMessage } from "@/lib/error-message";
import { createLogger } from "@/lib/logger";
import { CHECK_VERSION, checkQuestionRules } from "@/lib/question/check-rules";
import type { CheckIssue } from "@/lib/question/check-rules";
import { checkContext, CONTEXT_CODE, mergeCheckMetadata, rememberImportIssues, withCheckContext } from "@/lib/question/check-metadata";
import type { CheckContext } from "@/lib/question/check-metadata";

export interface StoredCheckIssue extends CheckIssue {
    source: "rules" | "ai";
    dismissed?: boolean;
    resolved?: boolean;
    model?: string;
    context?: CheckContext;
}

type CheckClient = Pick<Prisma.TransactionClient, "errorItem">;
const logger = createLogger("question-check");

/** 旧记录或损坏 JSON 视为空；单个坏条目不影响其余有效问题。 */
export function parseCheckIssues(raw: string | null | undefined): StoredCheckIssue[] {
    try {
        const value: unknown = JSON.parse(raw ?? "[]");
        if (!Array.isArray(value)) return [];
        return value.filter((entry: unknown): entry is StoredCheckIssue => {
            if (!entry || typeof entry !== "object") return false;
            const issue = entry as Record<string, unknown>;
            return typeof issue.code === "string" && typeof issue.field === "string"
                && (issue.severity === "major" || issue.severity === "minor")
                && (issue.visibility === "user" || issue.visibility === "agent")
                && (issue.source === "rules" || issue.source === "ai")
                && (issue.dismissed === undefined || typeof issue.dismissed === "boolean")
                && (issue.resolved === undefined || typeof issue.resolved === "boolean");
        });
    } catch { return []; }
}

export function questionCheckResponse(item: { checkStatus?: string | null; checkIssues?: string | null }) {
    return { status: item.checkStatus ?? "none", issues: parseCheckIssues(item.checkIssues).filter(issue => issue.code !== CONTEXT_CODE) };
}

/** 重跑规则只替换规则结论；保留 AI 原始条目及已忽略类型的记忆。 */
export function mergeRuleCheckIssues(raw: string | null | undefined, rules: CheckIssue[]) {
    const previous = parseCheckIssues(raw);
    const key = (issue: CheckIssue) => JSON.stringify([issue.code, issue.field]);
    const dismissed = new Set(previous.filter((issue) => issue.dismissed).map(key));
    const current = new Set(rules.map(key));
    const issues: StoredCheckIssue[] = [
        ...previous.filter((issue) => issue.code !== CONTEXT_CODE && (issue.source === "ai" || ((issue.dismissed || issue.resolved) && !current.has(key(issue))))),
        ...rules.map((issue) => ({ ...issue, source: "rules" as const, dismissed: dismissed.has(key(issue)) })),
    ];
    const status = issues.some((issue) => issue.visibility === "user" && !issue.dismissed && !issue.resolved) ? "flagged" : "pass";
    return { checkStatus: status, checkIssues: JSON.stringify(mergeCheckMetadata(previous, issues)), checkedAt: new Date(), checkVersion: CHECK_VERSION };
}

/** 同步检查；出处关联写入后调用。检查失败不能使已授权的保存失败。 */
export async function checkSavedQuestion(id: string, client?: CheckClient): Promise<Pick<ErrorItem, "checkStatus" | "checkIssues" | "checkedAt" | "checkVersion" | "updatedAt"> | null> {
    try {
        if (!client) return await runSerializedTransaction((tx) => checkSavedQuestion(id, tx));
        const item = await client.errorItem.findUnique({
            where: { id }, include: { questionRegions: { select: { page: { select: { origin: true } } } } },
        });
        if (!item) return null;
        const data = mergeRuleCheckIssues(item.checkIssues, checkQuestionRules({
            ...item,
            hasSourcePage: item.questionRegions.length > 0,
            sourceType: item.questionRegions[0]?.page.origin
                ?? (["image", "pdf", "upload"].includes(item.source ?? "") ? item.source : item.originalImageUrl ? "image" : "text"),
        }));
        if (!item.checkedAt && !checkContext(parseCheckIssues(data.checkIssues))) {
            data.checkIssues = JSON.stringify(rememberImportIssues(withCheckContext(parseCheckIssues(data.checkIssues), {
                origin: "import", observedAt: new Date().toISOString(),
            })));
        }
        return await client.errorItem.update({ where: { id }, data, select: {
            checkStatus: true, checkIssues: true, checkedAt: true, checkVersion: true, updatedAt: true,
        } });
    } catch (error) {
        logger.warn({ errorItemId: id, error: getErrorMessage(error) }, "规则检查失败，题目照常保存");
        return null;
    }
}

export function mergeAiCheckIssues(raw: string | null | undefined, incoming: CheckIssue[], model: string) {
    const previous = parseCheckIssues(raw);
    const key = (issue: CheckIssue) => JSON.stringify([issue.code, issue.field]);
    const dismissed = new Set(previous.filter(issue => issue.dismissed).map(key));
    const current = new Set(incoming.map(key));
    const issues: StoredCheckIssue[] = [
        ...previous.filter(issue => issue.code !== CONTEXT_CODE && (issue.source === 'rules' || ((issue.dismissed || issue.resolved) && !current.has(key(issue))))),
        ...incoming.map(issue => ({ ...issue, source: 'ai' as const, model, dismissed: dismissed.has(key(issue)) })),
    ];
    return {
        checkStatus: issues.some(issue => issue.visibility === 'user' && !issue.dismissed && !issue.resolved) ? 'flagged' : 'pass',
        checkIssues: JSON.stringify(mergeCheckMetadata(previous, issues)), checkedAt: new Date(), checkVersion: CHECK_VERSION,
    };
}
