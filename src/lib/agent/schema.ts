import { z } from "zod";
import { sourceRegionsSchema } from "@/lib/source-page/layout";
import { SOURCE_PAGE_MAX_BYTES } from "@/lib/source-page/limits";
import { MAX_FIGURE_SVG_LENGTH } from "@/lib/figure-svg";

export const AGENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const agentImageSchema = z.union([
    z.object({ base64: z.string().min(1).max(Math.ceil(AGENT_IMAGE_MAX_BYTES / 3) * 4), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]) }).strict(),
    z.object({ url: z.url().max(2048) }).strict(),
]);
/** MIME 由服务端嗅探后验证，非 JPEG/PNG 返回专用错误码。 */
export const agentSourceImageSchema = z.union([
    z.object({ base64: z.string().min(1).max(Math.ceil(SOURCE_PAGE_MAX_BYTES / 3) * 4), mimeType: z.string().min(1).max(100) }).strict(),
    z.object({ url: z.url().max(2048) }).strict(),
]);
const sourceMetadata = {
    fileName: z.string().trim().min(1).max(1000).optional(),
    pageNumber: z.number().int().min(1).max(100000).optional(),
};
export const agentUploadSourcePageSchema = z.union([
    agentSourceImageSchema.options[0].extend({ ...sourceMetadata, origin: z.enum(["agent", "upload", "pdf", "docx"]).default("agent") }),
    agentSourceImageSchema.options[1].extend({ ...sourceMetadata, origin: z.enum(["agent", "upload", "pdf", "docx"]).default("agent") }),
]);
export const agentSourceSchema = z.object({
    pageId: z.string().trim().min(1).max(100).optional(),
    page: agentSourceImageSchema.optional(),
    ...sourceMetadata,
    regions: sourceRegionsSchema,
}).strict().refine((source) => !!source.pageId !== !!source.page, { message: "AGENT_SOURCE_INVALID" });
const exclusiveSourceImage = (item: { sourcePage?: unknown; image?: unknown }) =>
    !(item.sourcePage && item.image !== undefined);
const optionalText = (length: number) => z.string().max(length).nullish();
export const agentItemSchema = z.object({
    questionText: z.string().trim().min(1).max(20000),
    answerText: optionalText(20000), analysis: optionalText(50000),
    wrongAnswerText: optionalText(20000), mistakeAnalysis: optionalText(50000),
    mistakeStatus: z.enum(["not_attempted", "wrong_attempt", "unknown"]).nullish(),
    questionType: optionalText(200),
    knowledgePoints: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    source: optionalText(1000), sourcePage: agentSourceSchema.optional(), errorType: optionalText(1000), userNotes: optionalText(20000),
    gradeSemester: optionalText(100), difficultyStars: z.number().int().min(1).max(5).nullish(),
    notebookId: z.string().trim().min(1).max(100).optional(),
    notebookName: z.string().trim().min(1).max(100).optional(),
    createNotebook: z.boolean().default(false),
    // 题目自带的几何图、数轴等配图与原图分开：配图由 agent 重绘为 SVG，原图为整题照片
    hasFigure: z.boolean().optional(),
    figureSvg: z.string().max(MAX_FIGURE_SVG_LENGTH).nullish(),
    image: agentImageSchema.optional(),
}).strict().refine((item) => !!item.notebookId !== !!item.notebookName, { message: "Specify notebookId or notebookName, exclusively" })
    .refine(exclusiveSourceImage, { message: "AGENT_SOURCE_INVALID", path: ["sourcePage"] });

/** 先校验批次形状，再逐项校验，避免一项无效导致整批丢失。 */
export const agentBatchSchema = z.object({ items: z.array(z.unknown()).min(1).max(20) }).strict();
export const agentTagsSchema = z.object({ subjectId: z.string().trim().min(1).max(100), q: z.string().max(200).default("") });
export const agentDuplicatesSchema = z.object({ questionText: z.string().trim().min(1).max(20000) }).strict();

const identifier = z.string().trim().min(1).max(100);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const pagination = {
    offset: z.coerce.number().int().min(0).max(100000).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(20),
};
export const agentSearchSchema = z.object({
    notebookId: identifier.optional(), q: z.string().trim().max(200).optional(),
    source: z.string().max(1000).optional(),
    createdFrom: z.iso.datetime({ offset: true }).optional(), createdBefore: z.iso.datetime({ offset: true }).optional(),
    ...pagination,
}).strict();
export const agentGetSchema = z.object({ id: identifier, ...pagination }).strict();
export const agentImageQuerySchema = z.object({ id: identifier, recordId: identifier.optional() }).strict();

/** 只允许显式字段；省略保持原值，null 清除可空字段，空标签数组清除标签。 */
export const agentItemPatchSchema = z.object({
    questionText: z.string().trim().min(1).max(20000).optional(),
    answerText: optionalText(20000), analysis: optionalText(50000),
    wrongAnswerText: optionalText(20000), mistakeAnalysis: optionalText(50000),
    mistakeStatus: z.enum(["not_attempted", "wrong_attempt", "unknown"]).optional(),
    questionType: optionalText(200),
    knowledgePoints: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    notebookId: identifier.optional(), source: optionalText(1000), sourcePage: agentSourceSchema.optional(),
    errorType: optionalText(1000), userNotes: optionalText(20000),
    gradeSemester: optionalText(100), difficultyStars: z.number().int().min(1).max(5).nullish(),
    hasFigure: z.boolean().optional(), figureSvg: z.string().max(MAX_FIGURE_SVG_LENGTH).nullish(),
    image: agentImageSchema.nullish(),
}).strict().refine((patch) => Object.values(patch).some((value) => value !== undefined))
    .refine(exclusiveSourceImage, { message: "AGENT_SOURCE_INVALID", path: ["sourcePage"] });
export const agentUpdateSchema = z.object({ id: identifier, expectedRevision: revision, patch: agentItemPatchSchema }).strict();
export const agentDeleteSchema = z.object({ id: identifier, expectedRevision: revision, confirm: z.literal(true) }).strict();

export const agentRecordPatchSchema = z.object({
    questionText: optionalText(20000), answerText: optionalText(20000), analysis: optionalText(50000),
    wrongAnswerText: optionalText(20000), mistakeAnalysis: optionalText(50000), notes: optionalText(20000),
    result: z.enum(["wrong", "not_attempted", "correct"]).optional(),
    figureSvg: z.string().max(MAX_FIGURE_SVG_LENGTH).nullish(), image: agentImageSchema.nullish(),
}).strict().refine((patch) => Object.values(patch).some((value) => value !== undefined));
export const agentUpdateRecordSchema = z.object({
    id: identifier, expectedRevision: revision, recordId: identifier, patch: agentRecordPatchSchema,
}).strict();
export const agentDeleteRecordSchema = agentDeleteSchema.extend({ recordId: identifier });
