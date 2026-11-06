import "server-only";

import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RateLimiter } from "@/lib/rate-limit";
import { inferTagScope } from "@/lib/tags/tag-resolver";
import { findDuplicateQuestion } from "@/lib/question/question-deduplication";
import { importSchema, saveQuestion } from "@/lib/question/question-save";
import { classifyQuestionSaveError } from "@/lib/question/question-save-failure";
import { createLogger } from "@/lib/logger";
import { prepareAgentImage } from "@/lib/agent/image";
import { getOptionalAgentSkillInfo } from "@/lib/agent/skill-version";
import { agentBatchSchema, agentDuplicatesSchema, agentItemSchema, agentTagsSchema } from "@/lib/agent/schema";

const logger = createLogger("agent-import");
const imports = new RateLimiter({ limit: 10, windowMs: 60_000 });
export type AgentOperation = "list_notebooks" | "search_tags" | "find_duplicates" | "create_error_items";

export class AgentInputError extends Error {
    constructor(message: string, readonly status = 400, readonly retryAfterMs = 0) { super(message); }
}

function validate<T>(parsed: { success: true; data: T } | { success: false }): T {
    if (!parsed.success) throw new AgentInputError("AGENT_INVALID_INPUT");
    return parsed.data;
}

async function ownedNotebook(userId: string, id: string) {
    const notebook = await prisma.subject.findFirst({ where: { id, userId } });
    if (!notebook) throw new AgentInputError("AGENT_NOTEBOOK_NOT_FOUND", 404);
    return notebook;
}

export async function listAgentNotebooks(user: User, origin: string) {
    const notebooks = await prisma.subject.findMany({
        where: { userId: user.id }, orderBy: { createdAt: "asc" },
        select: { id: true, name: true, stage: true, subjectKey: true, tagSet: true },
    });
    const skill = await getOptionalAgentSkillInfo(origin);
    return skill ? { notebooks, skill } : { notebooks };
}

export async function searchAgentTags(user: User, input: unknown) {
    const { subjectId, q } = validate(agentTagsSchema.safeParse(input));
    const notebook = await ownedNotebook(user.id, subjectId);
    const { subjectKey, tagSet } = inferTagScope(notebook);
    return { tags: await prisma.knowledgeTag.findMany({
        where: { subject: subjectKey, tagSet, name: { contains: q }, OR: [{ isSystem: true }, { userId: user.id }] },
        take: 50, orderBy: [{ isSystem: "desc" }, { order: "asc" }, { id: "asc" }],
        select: { id: true, name: true, parentId: true, subject: true, tagSet: true, isSystem: true },
    }) };
}

export async function findAgentDuplicates(user: User, input: unknown, origin: string) {
    const data = validate(agentDuplicatesSchema.safeParse(input));
    const duplicate = await findDuplicateQuestion(prisma, user.id, data);
    if (!duplicate) return { duplicates: [] };
    const item = await prisma.errorItem.findFirst({
        where: { id: duplicate.id, userId: user.id }, select: { id: true, shortId: true, questionText: true, subjectId: true },
    });
    return { duplicates: item ? [{ ...item, similarity: duplicate.similarity, link: `${origin}/error-items/${item.id}` }] : [] };
}

export async function createAgentErrorItems(user: User, input: unknown, origin: string) {
    const { items } = validate(agentBatchSchema.safeParse(input));
    const results = [];
    for (const [index, raw] of items.entries()) {
        const parsed = agentItemSchema.safeParse(raw);
        if (!parsed.success) {
            results.push({ index, error: "AGENT_INVALID_ITEM", fields: parsed.error.issues.map((issue) => issue.path.join(".")) });
            continue;
        }
        const item = parsed.data;
        try {
            let notebookId = item.notebookId;
            if (notebookId) await ownedNotebook(user.id, notebookId);
            else {
                const existing = await prisma.subject.findFirst({ where: { userId: user.id, name: item.notebookName } });
                if (!existing && !item.createNotebook) throw new AgentInputError("AGENT_NOTEBOOK_NOT_FOUND", 404);
                notebookId = existing?.id;
            }
            let originalImageUrl: string;
            try { originalImageUrl = await prepareAgentImage(item.image); }
            catch { throw new AgentInputError("AGENT_IMAGE_INVALID"); }
            const body = importSchema.parse({
                ...item, originalImageUrl, subjectId: notebookId,
                subjectName: notebookId ? undefined : item.notebookName,
            });
            const result = await saveQuestion(user, body, {
                allowAi: false, origin: "agent",
                extraErrorItemData: { source: item.source ?? "agent", errorType: item.errorType, userNotes: item.userNotes },
            });
            if (!result.ok) {
                results.push({ index, error: result.error.code });
                continue;
            }
            results.push({ index, id: result.item.id, shortId: result.item.shortId, status: result.status, link: `${origin}/error-items/${result.item.id}` });
        } catch (error) {
            const code = error instanceof AgentInputError ? error.message : classifyQuestionSaveError(error).code;
            results.push({ index, error: code });
        }
    }
    // ImportBatch 管理分题草稿与待识别任务；已结构化且逐题同步保存的请求不创建可重跑识别的批次。
    logger.info({ userId: user.id, origin: "agent", total: items.length, succeeded: results.filter((item) => "id" in item).length }, "代理结构化导入完成");
    return { results };
}

/** REST 与 MCP 共享按操作计算的导入限流和领域逻辑；请求限流由 HTTP 入口负责。 */
export async function runAgentOperation(user: User, operation: AgentOperation, input: unknown, origin: string) {
    const retry = operation === "create_error_items" ? imports.retryAfter(user.id) : 0;
    if (retry) throw new AgentInputError("AGENT_RATE_LIMITED", 429, retry);
    if (operation === "create_error_items") imports.hit(user.id);
    switch (operation) {
        case "list_notebooks": return listAgentNotebooks(user, origin);
        case "search_tags": return searchAgentTags(user, input);
        case "find_duplicates": return findAgentDuplicates(user, input, origin);
        case "create_error_items": return createAgentErrorItems(user, input, origin);
    }
}
