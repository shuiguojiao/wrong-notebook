import "server-only";

import { ZodError } from "zod";
import { createErrorResponse, ErrorCode, validationError } from "@/lib/api-errors";
import { getErrorMessage } from "@/lib/error-message";
import type { AuthenticatedContext } from "@/lib/api-handler";

export type AttemptRouteContext = AuthenticatedContext & { params: Promise<{ id: string; aid: string }> };

export type AnswerRouteContext = AuthenticatedContext & { params: Promise<{ id: string; aid: string; questionId: string }> };

/** 领域错误保留稳定错误码，未知异常交由 withUser 统一记录。 */
export async function attemptResponse(action: () => Promise<Response>): Promise<Response> {
    try { return await action(); }
    catch (error) {
        if (error instanceof ZodError) return validationError('Invalid exam attempt input', error.issues);
        if (error instanceof SyntaxError) return validationError('Invalid JSON');
        const code = getErrorMessage(error);
        switch (code) {
            case ErrorCode.EXAM_NOT_FOUND:
            case ErrorCode.EXAM_ATTEMPT_NOT_FOUND:
            case ErrorCode.EXAM_QUESTION_NOT_FOUND:
                return createErrorResponse(code, 404, code);
            case 'EXAM_GRADE_RETRY_LIMIT':
                return createErrorResponse(code, 409, ErrorCode.EXAM_ATTEMPT_INVALID_STATUS);
            case 'AI_CONSENT_REQUIRED':
                return createErrorResponse(ErrorCode.AI_CONSENT_REQUIRED, 403, code);
            case ErrorCode.EXAM_ATTEMPT_INCOMPLETE:
            case ErrorCode.EXAM_ATTEMPT_INVALID_STATUS:
                return createErrorResponse(code, 409, code);
            default: throw error;
        }
    }
}
