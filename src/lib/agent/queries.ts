import "server-only";

import { createHash } from "node:crypto";
import type { Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readStoredImage } from "@/lib/image-storage";
import { AgentInputError, validateAgentInput } from "@/lib/agent/errors";
import { agentGetSchema, agentImageQuerySchema, agentSearchSchema } from "@/lib/agent/schema";

type AgentClient = Pick<Prisma.TransactionClient, "errorItem" | "subject">;
const detailInclude = {
    subject: { select: { id: true, name: true, stage: true, subjectKey: true, tagSet: true } },
    tags: { orderBy: { id: "asc" as const }, select: { id: true, name: true } },
    practiceRecords: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }] },
} satisfies Prisma.ErrorItemInclude;
export type AgentItemDetail = Prisma.ErrorItemGetPayload<{ include: typeof detailInclude }>;

export async function loadAgentItem(client: AgentClient, userId: string, id: string) {
    const item = await client.errorItem.findFirst({
        where: { userId, OR: [{ id }, { shortId: id }] }, include: detailInclude,
    });
    if (!item) throw new AgentInputError("AGENT_ITEM_NOT_FOUND", 404);
    return item;
}

export async function loadAgentNotebook(client: AgentClient, userId: string, id: string) {
    const notebook = await client.subject.findFirst({ where: { id, userId } });
    if (!notebook) throw new AgentInputError("AGENT_NOTEBOOK_NOT_FOUND", 404);
    return notebook;
}

/** 做错记录没有 updatedAt；内容摘要同时覆盖网页编辑与新增/修改记录，不依赖毫秒时间戳。 */
export function agentItemRevision(item: AgentItemDetail): string {
    // 调度缓存会因懒迁移、回填而变化，只有记录及手动调整等事实应影响编辑修订。
    const { reviewStage: _stage, reviewWrongStreak: _streak, nextReviewAt: _next, reviewCompletedAt: _completed, reviewSyncedAt: _synced, ...facts } = item;
    return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

export function checkAgentRevision(item: AgentItemDetail, expected: string) {
    if (agentItemRevision(item) !== expected) throw new AgentInputError("AGENT_REVISION_CONFLICT", 409);
}

function originalImageUrl(origin: string, id: string, image: string | null, recordId?: string) {
    return image ? `${origin}/api/agent/error-items/image?id=${encodeURIComponent(id)}${recordId ? `&recordId=${encodeURIComponent(recordId)}` : ""}` : null;
}

export function agentItemResponse(item: AgentItemDetail, origin: string, offset = 0, limit = 20) {
    const { userId: _userId, originalImageUrl: image, practiceRecords, knowledgePoints: _legacy, ...fields } = item;
    return {
        ...fields, notebookId: item.subjectId, knowledgePoints: item.tags.map((tag) => tag.name),
        originalImageUrl: originalImageUrl(origin, item.id, image),
        revision: agentItemRevision(item), link: `${origin}/error-items/${item.id}`,
        records: practiceRecords.slice(offset, offset + limit).map(({ userId: _owner, originalImageUrl: recordImage, ...record }) => ({
            ...record, originalImageUrl: originalImageUrl(origin, item.id, recordImage, record.id),
            editable: record.source === "duplicate_import" && !record.examQuestionId,
        })),
        recordTotal: practiceRecords.length,
        nextOffset: offset + limit < practiceRecords.length ? offset + limit : null,
    };
}

export async function getAgentErrorItem(user: User, input: unknown, origin: string) {
    const { id, offset, limit } = validateAgentInput(agentGetSchema.safeParse(input));
    // 读取主体与关联记录使用同一快照，返回的 revision 可直接用于后续写操作。
    return prisma.$transaction(async (tx) => ({ item: agentItemResponse(await loadAgentItem(tx, user.id, id), origin, offset, limit) }));
}

export async function searchAgentErrorItems(user: User, input: unknown, origin: string) {
    const data = validateAgentInput(agentSearchSchema.safeParse(input));
    if (data.notebookId) await loadAgentNotebook(prisma, user.id, data.notebookId);
    const where: Prisma.ErrorItemWhereInput = {
        userId: user.id, subjectId: data.notebookId,
        ...(data.source !== undefined ? { source: { contains: data.source } } : {}),
        ...(data.q ? { OR: [{ questionText: { contains: data.q } }, { source: { contains: data.q } }, { shortId: data.q }] } : {}),
        ...(data.createdFrom || data.createdBefore ? { createdAt: { gte: data.createdFrom, lt: data.createdBefore } } : {}),
    };
    const [total, items] = await prisma.$transaction([
        prisma.errorItem.count({ where }),
        prisma.errorItem.findMany({
            where, skip: data.offset, take: data.limit, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true, shortId: true, questionText: true, source: true, subjectId: true, createdAt: true, updatedAt: true },
        }),
    ]);
    return {
        items: items.map((item) => ({ ...item, notebookId: item.subjectId, link: `${origin}/error-items/${item.id}` })),
        total, nextOffset: data.offset + data.limit < total ? data.offset + data.limit : null,
    };
}

/** 原图通过同一代理令牌读取，不暴露磁盘路径，也不依赖网页会话。 */
export async function agentImageResponse(user: User, input: unknown) {
    const { id, recordId } = validateAgentInput(agentImageQuerySchema.safeParse(input));
    const item = await loadAgentItem(prisma, user.id, id);
    const record = recordId ? item.practiceRecords.find((entry) => entry.id === recordId && entry.userId === user.id) : null;
    if (recordId && !record) throw new AgentInputError("AGENT_RECORD_NOT_FOUND", 404);
    const reference = recordId ? record?.originalImageUrl : item.originalImageUrl;
    const image = reference ? await readStoredImage(reference) : null;
    if (!image) throw new AgentInputError("AGENT_IMAGE_NOT_FOUND", 404);
    return new Response(new Uint8Array(image.bytes), { headers: { "Content-Type": image.mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
