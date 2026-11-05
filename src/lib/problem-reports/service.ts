import "server-only";

import { reportSnapshotSchema } from "@/lib/problem-reports/schema";
import type { Prisma } from "@prisma/client";
import type { ReportSnapshot } from "./schema";

/** 用户记录仅返回反馈本身，不把快照或后台关联标识带到用户列表。 */
export const userReportSelect = {
    id: true, category: true, description: true, status: true, adminNote: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ProblemReportSelect;

function usageReference(raw: string | null): string | null {
    try {
        const value: unknown = JSON.parse(raw ?? "null");
        if (value && typeof value === 'object' && 'reportAiUsageId' in value && typeof value.reportAiUsageId === 'string') return value.reportAiUsageId;
    } catch { /* 旧任务可能没有合法 JSON 或调用关联。 */ }
    return null;
}

/** 只读当前用户的题目，快照不含图片内容、路径、可访问完整错题本的链接。 */
export async function snapshotForReport(tx: Prisma.TransactionClient, userId: string, errorItemId: string): Promise<ReportSnapshot | null> {
    const item = await tx.errorItem.findFirst({
        where: { id: errorItemId, userId },
        include: { tags: true, subject: true, importTasks: { where: { userId, status: 'saved', duplicate: false }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!item) return null;
    const task = item.importTasks[0];
    const usageId = usageReference(task?.result ?? null);
    const usage = usageId ? await tx.aiUsage.findFirst({ where: { id: usageId, userId }, select: { provider: true, model: true } }) : null;
    // 旧题没有导入任务时不猜测文字录入来源；有图片仍可确定图片输入。
    return reportSnapshotSchema.parse({
        questionText: item.questionText ?? item.ocrText,
        answerText: item.answerText,
        analysis: item.analysis,
        knowledgePoints: item.tags.length ? item.tags.map(tag => tag.name) : legacyTags(item.knowledgePoints),
        subject: item.subject?.name ?? null,
        gradeSemester: item.gradeSemester,
        source: item.source,
        entryMethod: task ? (task.inputText && !item.originalImageUrl ? 'text' : 'image') : item.originalImageUrl ? 'image' : 'unknown',
        hasOriginalImage: !!item.originalImageUrl,
        aiProvider: usage?.provider ?? null,
        aiModel: usage?.model ?? null,
    });
}

function legacyTags(raw: string | null): string[] {
    try { const data: unknown = JSON.parse(raw ?? '[]'); return Array.isArray(data) ? data.filter((x): x is string => typeof x === 'string') : []; }
    catch { return []; }
}
