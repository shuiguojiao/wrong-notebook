import "server-only";

import { getAIService } from '@/lib/ai';
import type { AnswerGradingInput } from '@/lib/ai/types';

/** 复习与试卷使用同一基类方法、提示词和多图请求协议。 */
export async function gradeAnswer(input: AnswerGradingInput) {
    return getAIService().gradeAnswer(input);
}
