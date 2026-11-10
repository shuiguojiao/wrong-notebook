import "server-only";

import { examPageLocationSchema } from '@/lib/exam/exam-photo-schema';
import { extractJsonObject } from './schema';
/**
 * 统一的 AI 回答解析工具
 *
 * 原先各提供商（OpenAI / Azure / Gemini / Anthropic）各自实现了一份
 * extractTag 与 parseResponse，行为存在差异，现收敛到本模块。
 *
 * 行为约定（以 OpenAI 版本为准，与各版本差异详见提交说明）：
 * - extractTag：analysis 标签缺少闭合标签（输出被截断）时读取到文本末尾，
 *   其余标签缺少闭合标签时返回 null
 * - parseQuestionResponse：返回 ParsedQuestion，必需标签缺失时抛错
 * - splitKnowledgePoints：按中英文逗号或换行切分知识点
 */
import { z } from 'zod';
import type { QuestionIntegrityResult } from './integrity';
import type { ParsedQuestion } from "./types";
import {
    safeParseParsedQuestion,
    parseDifficultyStars,
    parseFigure,
    parseQuestionType,
    stripThinkingTags,
} from "./schema";
import { normalizeMistakeStatusForSave } from "@/lib/question/mistake-status";
import { parseRecognizedGrade } from "@/lib/question/question-grade";
import { createLogger } from "../logger";

const logger = createLogger('ai:response-parser');

export function extractTag(text: string, tagName: string): string | null {
    const cleaned = stripThinkingTags(text);
    const startTag = `<${tagName}>`;
    const endTag = `</${tagName}>`;
    const startIndex = cleaned.indexOf(startTag);

    // 如果找不到开始标签，返回 null
    if (startIndex === -1) {
        return null;
    }

    const contentStartIndex = startIndex + startTag.length;
    const endIndex = cleaned.lastIndexOf(endTag);

    // 特殊处理：如果闭合标签丢失（通常主要发生在最后的 analysis 标签被截断时）
    // 我们尝试读取到字符串末尾
    if (endIndex === -1 && tagName === 'analysis') {
        logger.warn({ tagName }, 'Tag was verified unclosed, treating as truncated and reading to end');
        return cleaned.substring(contentStartIndex).trim();
    }

    if (endIndex === -1 || contentStartIndex >= endIndex) {
        return null;
    }

    return cleaned.substring(contentStartIndex, endIndex).trim();
}

export function splitKnowledgePoints(raw: string | null | undefined): string[] {
    return (raw || '').split(/[,，\n]/).map(k => k.trim()).filter(k => k.length > 0);
}

export function parseQuestionResponse(text: string): ParsedQuestion {
    logger.debug({ textLength: text.length }, 'Parsing AI response');

    const questionText = extractTag(text, "question_text");
    const answerText = extractTag(text, "answer_text");
    const analysis = extractTag(text, "analysis");
    const subjectRaw = extractTag(text, "subject");
    const knowledgePointsRaw = extractTag(text, "knowledge_points");
    const requiresImageRaw = extractTag(text, "requires_image");
    const wrongAnswerText = extractTag(text, "wrong_answer_text") || "";
    const mistakeAnalysis = extractTag(text, "mistake_analysis") || "";
    const mistakeStatusRaw = extractTag(text, "mistake_status");

    // Basic Validation
    if (!questionText || !answerText || !analysis) {
        logger.error({ rawTextSample: text.substring(0, 500) }, 'Missing critical XML tags');
        throw new Error("Invalid AI response: Missing critical XML tags (<question_text>, <answer_text>, or <analysis>)");
    }

    // Process Subject
    let subject: ParsedQuestion['subject'] = '其他';
    const validSubjects: ParsedQuestion['subject'][] = ["数学", "物理", "化学", "生物", "英语", "语文", "历史", "地理", "政治", "其他"];
    if (subjectRaw && (validSubjects as string[]).includes(subjectRaw)) {
        subject = subjectRaw as ParsedQuestion['subject'];
    }

    // Process Knowledge Points
    const knowledgePoints = splitKnowledgePoints(knowledgePointsRaw);

    // Process requiresImage (default to false if not present or unrecognized)
    const requiresImage = requiresImageRaw?.toLowerCase().trim() === 'true';
    const mistakeStatus = normalizeMistakeStatusForSave(mistakeStatusRaw, wrongAnswerText);

    // Construct Result
    const result: ParsedQuestion = {
        questionText,
        answerText,
        analysis,
        wrongAnswerText,
        mistakeAnalysis,
        mistakeStatus,
        subject,
        knowledgePoints,
        requiresImage,
        gradeSemester: parseRecognizedGrade(extractTag(text, "grade_semester")),
        difficultyStars: parseDifficultyStars(extractTag(text, "difficulty_stars")),
        questionType: parseQuestionType(extractTag(text, "question_type")),
        ...parseFigure(extractTag(text, "has_figure"), extractTag(text, "figure_svg")),
    };

    // Final Schema Validation (just to be safe, though likely compliant by now)
    const validation = safeParseParsedQuestion(result);
    if (validation.success) {
        logger.debug('Validated successfully via XML tags');
        return validation.data;
    } else {
        logger.warn({ validationError: validation.error.format() }, 'Schema validation warning');
        // We still return it as we trust our extraction more than the schema at this point
        return result;
    }
}

/** 判题 JSON 与题目解析共用此入口，保留可选手写识别文本。 */
export { parseAnswerGrading } from "./schema";

const integritySchema = z.object({
    image_text: z.string(),
    same_question: z.enum(['yes', 'no', 'unsure']),
    crop: z.enum(['complete', 'cut_off', 'unsure']),
    text_diffs: z.array(z.object({ image_says: z.string(), text_says: z.string(), severity: z.enum(['major', 'minor']) })),
    student_answer: z.enum(['match', 'mismatch', 'not_visible', 'not_given']),
    student_answer_diff: z.string(),
    confidence: z.number().finite().min(0).max(1),
    summary: z.string(),
});

/** 缺字段也拒绝，避免把不完整输出当作检查通过；沿用可重试的响应错误码。 */
export function parseQuestionIntegrity(text: string): QuestionIntegrityResult {
    try {
        const cleaned = stripThinkingTags(text).trim();
        const json = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? cleaned;
        const result = integritySchema.parse(JSON.parse(json));
        return {
            imageText: result.image_text, sameQuestion: result.same_question, crop: result.crop,
            textDiffs: result.text_diffs.map(diff => ({ imageSays: diff.image_says, textSays: diff.text_says, severity: diff.severity })),
            studentAnswer: result.student_answer, studentAnswerDiff: result.student_answer_diff,
            confidence: result.confidence, summary: result.summary,
        };
    } catch {
        // 不附模型原文，避免后台任务错误中泄露学生作业。
        throw new Error('AI_RESPONSE_ERROR: 图文核对结果格式无效');
    }
}

/** 定位结果缺少整页可读性时拒绝猜测，其余可缺字段采用保守默认值。 */
export function parseExamAnswers(text: string) {
    return examPageLocationSchema.parse(extractJsonObject(text));
}
