import "server-only";

import type { Prisma, User } from "@prisma/client";
import type { z } from "zod";
import { runSerializedTransaction } from "@/lib/db-write-queue";
import { sanitizeFigureSvg } from "@/lib/figure-svg";
import { createLogger } from "@/lib/logger";
import { storeImage } from "@/lib/image-storage";
import { prepareAgentSource, replaceQuestionSource } from "@/lib/source-page";
import { prisma } from "@/lib/prisma";
import { normalizeMistakeStatusForSave } from "@/lib/question/mistake-status";
import { normalizeQuestionType } from "@/lib/question/question-type";
import { inferTagScope, resolveOrCreateTags } from "@/lib/tags/tag-resolver";
import { AgentInputError, validateAgentInput } from "@/lib/agent/errors";
import { prepareAgentImage } from "@/lib/agent/image";
import { agentItemResponse, checkAgentRevision, loadAgentItem, loadAgentNotebook } from "@/lib/agent/queries";
import { agentDeleteSchema, agentUpdateSchema } from "@/lib/agent/schema";
import type { agentImageSchema } from "@/lib/agent/schema";

const logger = createLogger("agent-edit");

export function checkedAgentSvg(value: string | null | undefined) {
    if (value === undefined || value === null || value === "") return value || null;
    const svg = sanitizeFigureSvg(value);
    if (!svg) throw new AgentInputError("AGENT_FIGURE_INVALID");
    return svg;
}

export async function prepareAgentPatchImage(image: z.infer<typeof agentImageSchema> | null | undefined) {
    if (image === undefined) return undefined;
    if (image === null) return "";
    try { return await prepareAgentImage(image); }
    catch { throw new AgentInputError("AGENT_IMAGE_INVALID"); }
}

export async function updateAgentErrorItem(user: User, input: unknown, origin: string) {
    const parsed = agentUpdateSchema.safeParse(input);
    if (!parsed.success && parsed.error.issues.some((issue) => issue.path.includes("sourcePage"))) throw new AgentInputError("AGENT_SOURCE_INVALID");
    const { id, expectedRevision, patch } = validateAgentInput(parsed);
    // 下载前先校验归属与版本；事务内再次检查，下载期间的网页修改也不会被覆盖。
    const initial = await loadAgentItemForImage(user.id, id, expectedRevision);
    const source = patch.sourcePage ? await prepareAgentSource(user.id, patch.sourcePage) : undefined;
    const image = await prepareAgentPatchImage(patch.image);
    const storedImage = image !== undefined ? await storeImage(image) : undefined;
    const svg = patch.figureSvg !== undefined ? checkedAgentSvg(patch.figureSvg) : undefined;
    if (patch.hasFigure === false && svg) throw new AgentInputError("AGENT_FIGURE_INVALID");
    const result = await runSerializedTransaction(async (tx) => {
        const current = await loadAgentItem(tx, user.id, initial.id);
        checkAgentRevision(current, expectedRevision);
        const notebook = patch.notebookId ? await loadAgentNotebook(tx, user.id, patch.notebookId) : current.subject;
        const data: Prisma.ErrorItemUncheckedUpdateInput = {};
        for (const key of ["questionText", "answerText", "analysis", "wrongAnswerText", "mistakeAnalysis", "errorType", "userNotes", "gradeSemester", "difficultyStars"] as const) {
            if (patch[key] !== undefined) Object.assign(data, { [key]: patch[key] });
        }
        if (patch.source !== undefined) data.source = patch.source;
        if (patch.notebookId !== undefined) data.subjectId = patch.notebookId;
        if (patch.questionType !== undefined) {
            const normalized = patch.questionType ? normalizeQuestionType(patch.questionType) : null;
            if (patch.questionType?.trim() && !normalized) throw new AgentInputError("AGENT_QUESTION_TYPE_INVALID");
            data.questionType = normalized;
        }
        if (patch.mistakeStatus !== undefined || patch.wrongAnswerText !== undefined) {
            data.mistakeStatus = normalizeMistakeStatusForSave(patch.mistakeStatus ?? current.mistakeStatus,
                patch.wrongAnswerText !== undefined ? patch.wrongAnswerText : current.wrongAnswerText);
        }
        if (storedImage !== undefined) data.originalImageUrl = storedImage;
        if (svg !== undefined) { data.figureSvg = svg; data.hasFigure = !!svg || patch.hasFigure === true || current.hasFigure; }
        if (patch.hasFigure !== undefined) data.hasFigure = patch.hasFigure || !!svg;
        if (patch.hasFigure === false) data.figureSvg = null;
        // 移动错题本时按目标体系重新匹配标签，避免留下原体系的关联。
        const names = patch.knowledgePoints ?? (patch.notebookId !== undefined ? current.tags.map((tag) => tag.name) : undefined);
        if (names !== undefined) {
            const tags = await resolveOrCreateTags(tx, {
                userId: user.id, tagNames: names, ...inferTagScope(notebook),
                gradeSemester: patch.gradeSemester !== undefined ? patch.gradeSemester : current.gradeSemester,
            });
            data.tags = { set: tags };
            data.knowledgePoints = JSON.stringify([...new Set(names)]);
        }
        if (patch.notebookId !== undefined || patch.questionType !== undefined) data.reviewSyncedAt = null;
        await tx.errorItem.update({ where: { id: current.id }, data });
        if (source) await replaceQuestionSource(tx, user.id, current.id, source);
        else if (storedImage !== undefined) await tx.questionRegion.deleteMany({ where: { errorItemId: current.id } });
        return { item: agentItemResponse(await loadAgentItem(tx, user.id, current.id), origin) };
    });
    logger.info({ userId: user.id, id: initial.id, fields: Object.keys(patch) }, "代理纠正错题完成");
    return result;
}

async function loadAgentItemForImage(userId: string, id: string, revision: string) {
    const item = await prisma.$transaction((tx) => loadAgentItem(tx, userId, id));
    checkAgentRevision(item, revision);
    return item;
}

export async function deleteAgentErrorItem(user: User, input: unknown) {
    const { id, expectedRevision } = validateAgentInput(agentDeleteSchema.safeParse(input));
    const result = await runSerializedTransaction(async (tx) => {
        const item = await loadAgentItem(tx, user.id, id);
        checkAgentRevision(item, expectedRevision);
        await tx.errorItem.delete({ where: { id: item.id } });
        return { id: item.id, shortId: item.shortId, deleted: true };
    });
    logger.info({ userId: user.id, id: result.id }, "代理删除误收录错题完成");
    return result;
}
