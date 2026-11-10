import "server-only";

import type { NextResponse } from "next/server";
import { getMonthlyAiUsage, MONTHLY_TOKEN_LIMIT_CODE } from "@/lib/ai-monthly-quota";
import { isMonthlyTokenLimitReached } from "@/lib/monthly-token-limit";
import { setAiUsageId } from "@/lib/ai-usage-context";
import { createErrorResponse, ErrorCode, internalError } from "@/lib/api-errors";
import type { ApiErrorResponse } from "@/lib/api-errors";
import { hasAiDataConsent } from "@/lib/ai-consent-store";
import type { ConsentUser } from "@/lib/ai-consent-store";
import { getAppConfig, getAppTimeZone } from "@/lib/config";
import { getDayRange } from "@/lib/date-time";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const logger = createLogger('ai-quota');

/** 计入额度的用户操作；后台自动进行的掌握概率评估不计入 */
export const AI_USAGE_KINDS = ['analyze', 'split', 'reanswer', 'practice', 'grade', 'exam-grade', 'figure', 'latex', 'geogebra', 'animation', 'exam', 'retag', 'integrity_check'] as const;
export type AiUsageKind = typeof AI_USAGE_KINDS[number];

interface QuotaUser extends ConsentUser {
    role?: string | null;
}

/** consumeAiQuota 返回的拒绝响应对应的错误码（每日/月度上限或未授权），供后台任务记录失败原因 */
export async function quotaRejectionCode(rejection: Response): Promise<'AI_DAILY_LIMIT_EXCEEDED' | 'AI_MONTHLY_TOKEN_LIMIT_EXCEEDED' | 'AI_CONSENT_REQUIRED' | 'INTERNAL_ERROR'> {
    const body = await rejection.clone().json().catch(() => null) as { code?: unknown } | null;
    if (body?.code === ErrorCode.INTERNAL_ERROR) return ErrorCode.INTERNAL_ERROR;
    if (body?.code === MONTHLY_TOKEN_LIMIT_CODE) return MONTHLY_TOKEN_LIMIT_CODE;
    return body?.code === ErrorCode.AI_CONSENT_REQUIRED ? 'AI_CONSENT_REQUIRED' : 'AI_DAILY_LIMIT_EXCEEDED';
}

/** 用户在应用时区的今天已发起的 AI 调用次数 */
export async function countTodayAiUsage(userId: string, now = new Date()): Promise<number> {
    const { start, end } = getDayRange(now, getAppTimeZone());
    // 导入后自动进行的图文核对不占用户的每日次数，token 仍计入月度上限
    return prisma.aiUsage.count({ where: { userId, createdAt: { gte: start, lt: end }, kind: { not: 'integrity_check' } } });
}

/**
 * 发起 AI 调用前检查授权与额度：
 * - 用户尚未同意 AI 数据授权时返回 403（AI_CONSENT_REQUIRED），不向 AI 服务商发送任何数据；
 * - 超出每日次数或每月 token 上限时返回 429；
 * 路由直接返回该响应，否则记录一次调用并返回 null。管理员不受次数限制，但同样记录用量、同样需要授权。
 * 授权检查失败（如数据库不可用）时拒绝调用；默认读取额度或记录失败时放行；配置了月限的普通用户统计失败时拒绝调用，避免绕过月限。
 */
export async function consumeAiQuota(user: QuotaUser, kind: AiUsageKind): Promise<NextResponse<ApiErrorResponse> | null> {
    setAiUsageId(undefined);
    let consented = false;
    try {
        consented = await hasAiDataConsent(user);
    } catch (error) {
        logger.error({ error, userId: user.id, kind }, 'Failed to check AI data consent');
    }
    if (!consented) {
        logger.info({ userId: user.id, kind }, 'AI call blocked: data consent not given');
        return createErrorResponse(ErrorCode.AI_CONSENT_REQUIRED, 403, ErrorCode.AI_CONSENT_REQUIRED);
    }
    let monthlyLimit = 0;
    try {
        const config = getAppConfig();
        const limit = config.aiDailyLimit ?? 0;
        monthlyLimit = config.aiMonthlyTokenLimit ?? 0;
        if (limit > 0 && user.role !== 'admin' && await countTodayAiUsage(user.id) >= limit) {
            logger.info({ userId: user.id, kind, limit }, 'AI daily limit reached');
            return createErrorResponse(ErrorCode.AI_DAILY_LIMIT_EXCEEDED, 429, ErrorCode.AI_DAILY_LIMIT_EXCEEDED, { limit });
        }
        if (monthlyLimit > 0 && user.role !== 'admin' && isMonthlyTokenLimitReached((await getMonthlyAiUsage(user.id)).totalTokens, monthlyLimit)) {
            return createErrorResponse(MONTHLY_TOKEN_LIMIT_CODE, 429, ErrorCode.AI_MONTHLY_TOKEN_LIMIT_EXCEEDED, { limit: monthlyLimit });
        }
        const usage = await prisma.aiUsage.create({ data: { userId: user.id, kind } });
        setAiUsageId(usage.id, { userId: user.id, admin: user.role === 'admin', startedAt: usage.createdAt });
    } catch (error) {
        logger.error({ error, userId: user.id, kind }, 'Failed to check AI quota');
        if (monthlyLimit > 0 && user.role !== 'admin') return internalError();
    }
    return null;
}
