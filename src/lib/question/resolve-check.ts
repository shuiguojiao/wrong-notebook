import "server-only";

import { z } from "zod";
import { AgentInputError } from "@/lib/agent/errors";
import { deleteAgentErrorItem } from "@/lib/agent/mutations";
import { agentItemRevision, loadAgentItem } from "@/lib/agent/queries";
import { runSerializedTransaction } from "@/lib/db-write-queue";
import { prisma } from "@/lib/prisma";
import { checkQuestionRules } from "@/lib/question/check-rules";
import { mergeRuleCheckIssues, parseCheckIssues } from "@/lib/question/check-store";
import { scheduleIntegrityCheck } from "@/lib/question/integrity-queue";
import { textSuggestion, visibleCheckIssues } from "@/lib/question/pending-checks";
import { storeImage } from "@/lib/image-storage";
import { imageFromSourceRegions } from "@/lib/source-page/crop-regions";
import { sourceRegionsSchema } from "@/lib/source-page/layout";
import type { User } from "@prisma/client";

export const resolveCheckSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("accept"), updatedAt: z.iso.datetime(), issueIndex: z.number().int().min(0) }).strict(),
    z.object({ action: z.literal("dismiss"), updatedAt: z.iso.datetime(), issueIndex: z.number().int().min(0) }).strict(),
    z.object({ action: z.literal("delete"), updatedAt: z.iso.datetime(), confirm: z.literal(true) }).strict(),
    z.object({ action: z.literal("reframe"), updatedAt: z.iso.datetime(), pageId: z.string().min(1).max(100), regions: sourceRegionsSchema }).strict(),
]);

type ResolveInput = z.infer<typeof resolveCheckSchema>;
type CheckedImageInput = { action: "replace"; updatedAt: string; imageUrl: string };

function checkVersion(actual: Date, expected: string) {
    if (actual.toISOString() !== expected) throw new AgentInputError("CHECK_CONFLICT", 409);
}

export async function resolveQuestionCheck(user: User, id: string, input: ResolveInput | CheckedImageInput) {
    const initial = await prisma.$transaction(tx => loadAgentItem(tx, user.id, id));
    checkVersion(initial.updatedAt, input.updatedAt);
    if (input.action === "delete") {
        // 复用已有整题删除，保留级联清理、归属与修订校验。
        return deleteAgentErrorItem(user, { id, expectedRevision: agentItemRevision(initial), confirm: true });
    }
    if (input.action === "reframe" && !initial.questionRegions.some(r => r.pageId === input.pageId && r.page.userId === user.id)) {
        throw new AgentInputError("CHECK_SOURCE_REQUIRED");
    }
    let source: { imageUrl: string; regions: Array<{ pageId: string; order: number; x: number; y: number; width: number; height: number }> } | null = null;
    if (input.action === "reframe") {
        const page = initial.questionRegions.find(region => region.pageId === input.pageId)!.page;
        // 只替换正在编辑的这一页，其余页的区域与相对阅读顺序保持不变。
        let inserted = false;
        const regions = initial.questionRegions.flatMap(region => {
            if (region.pageId !== input.pageId) return [region];
            if (inserted) return [];
            inserted = true;
            return input.regions.map(next => ({ ...region, ...next, page }));
        });
        if (regions.length > 4) throw new AgentInputError("CHECK_INVALID_REGIONS");
        const image = await imageFromSourceRegions(regions);
        source = { imageUrl: await storeImage(`data:${image.mimeType};base64,${image.bytes.toString("base64")}`),
            regions: regions.map(({ pageId, x, y, width, height }, order) => ({ pageId, order, x, y, width, height })) };
    }
    const updated = await runSerializedTransaction(async tx => {
        const current = await loadAgentItem(tx, user.id, id);
        checkVersion(current.updatedAt, input.updatedAt);
        if (agentItemRevision(current) !== agentItemRevision(initial)) throw new AgentInputError("CHECK_CONFLICT", 409);
        const issues = parseCheckIssues(current.checkIssues);
        let questionText = current.questionText;
        if (input.action === "accept" || input.action === "dismiss") {
            const issue = issues[input.issueIndex];
            if (!issue || issue.visibility !== "user" || issue.dismissed || issue.resolved) throw new AgentInputError("CHECK_ISSUE_GONE", 409);
            if (input.action === "dismiss") {
                for (const entry of issues) if (entry.code === issue.code && entry.field === issue.field) entry.dismissed = true;
            } else {
                const suggestion = textSuggestion(issue);
                if (issue.code !== "text_diff" || issue.field !== "questionText" || !suggestion) throw new AgentInputError("CHECK_NO_SUGGESTION");
                if (!questionText?.includes(suggestion.textSays)) throw new AgentInputError("CHECK_TEXT_NOT_FOUND");
                // 字符串 replace 只替换第一处；回调保留建议中的 $ 等字面字符。
                questionText = questionText.replace(suggestion.textSays, () => suggestion.imageSays);
                issue.resolved = true;
            }
        }
        if (source || input.action === "replace") {
            for (const issue of issues) if (issue.source === "ai" && !issue.dismissed) issue.resolved = true;
        }
        if (input.action === "replace") await tx.questionRegion.deleteMany({ where: { errorItemId: id } });
        if (source) {
            await tx.questionRegion.deleteMany({ where: { errorItemId: id } });
            await tx.questionRegion.createMany({ data: source.regions.map(region => ({ ...region, errorItemId: id })) });
        }
        const imageUrl = input.action === "replace" ? input.imageUrl : source?.imageUrl ?? current.originalImageUrl;
        const check = input.action === "dismiss" ? {
            checkIssues: JSON.stringify(issues), checkStatus: visibleCheckIssues(issues).length ? "flagged" : "dismissed",
        } : mergeRuleCheckIssues(JSON.stringify(issues), checkQuestionRules({ ...current, questionText,
            originalImageUrl: imageUrl, hasSourcePage: input.action !== "replace" && (!!source || current.questionRegions.length > 0),
            sourceType: current.questionRegions[0]?.page.origin ?? (["image", "pdf", "upload"].includes(current.source ?? "") ? current.source : current.originalImageUrl ? "image" : "text") }));
        // 显式递增时间戳，保证同毫秒内的连续操作也有不同版本。
        return tx.errorItem.update({ where: { id }, data: { ...check, questionText,
            originalImageUrl: imageUrl,
            updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) }, select: { id: true, updatedAt: true } });
    });
    if (input.action !== "dismiss") scheduleIntegrityCheck(id);
    return updated;
}
