import { z } from "zod";
import { MAX_FIGURE_SVG_LENGTH } from "@/lib/figure-svg";

export const AGENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const agentImageSchema = z.union([
    z.object({ base64: z.string().min(1).max(Math.ceil(AGENT_IMAGE_MAX_BYTES / 3) * 4), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]) }).strict(),
    z.object({ url: z.url().max(2048) }).strict(),
]);
const optionalText = (length: number) => z.string().max(length).nullish();
export const agentItemSchema = z.object({
    questionText: z.string().trim().min(1).max(20000),
    answerText: optionalText(20000), analysis: optionalText(50000),
    wrongAnswerText: optionalText(20000), mistakeAnalysis: optionalText(50000),
    mistakeStatus: z.enum(["not_attempted", "wrong_attempt", "unknown"]).nullish(),
    questionType: optionalText(200),
    knowledgePoints: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    source: optionalText(1000), errorType: optionalText(1000), userNotes: optionalText(20000),
    gradeSemester: optionalText(100), difficultyStars: z.number().int().min(1).max(5).nullish(),
    notebookId: z.string().trim().min(1).max(100).optional(),
    notebookName: z.string().trim().min(1).max(100).optional(),
    createNotebook: z.boolean().default(false),
    // 题目自带的几何图、数轴等配图与原图分开：配图由 agent 重绘为 SVG，原图为整题照片
    hasFigure: z.boolean().optional(),
    figureSvg: z.string().max(MAX_FIGURE_SVG_LENGTH).nullish(),
    image: agentImageSchema.optional(),
}).strict().refine((item) => !!item.notebookId !== !!item.notebookName, { message: "Specify notebookId or notebookName, exclusively" });

/** 先校验批次形状，再逐项校验，避免一项无效导致整批丢失。 */
export const agentBatchSchema = z.object({ items: z.array(z.unknown()).min(1).max(20) }).strict();
export const agentTagsSchema = z.object({ subjectId: z.string().trim().min(1).max(100), q: z.string().max(200).default("") });
export const agentDuplicatesSchema = z.object({ questionText: z.string().trim().min(1).max(20000) }).strict();
