import "server-only";

import { getAiUsageContext } from '@/lib/ai-usage-context';
import { getAppConfig, getAppTimeZone } from '@/lib/config';
import { getMonthRange } from '@/lib/date-time';
import { prisma } from '@/lib/prisma';
import { isMonthlyTokenLimitReached } from '@/lib/monthly-token-limit';

export const MONTHLY_TOKEN_LIMIT_CODE = 'AI_MONTHLY_TOKEN_LIMIT_EXCEEDED';

export async function getMonthlyAiUsage(userId: string, now = new Date()) {
    const { start, end } = getMonthRange(now, getAppTimeZone());
    const usage = await prisma.aiUsage.aggregate({ where: { userId, createdAt: { gte: start, lt: end } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true } });
    const inputTokens = usage._sum.inputTokens ?? 0;
    const outputTokens = usage._sum.outputTokens ?? 0;
    return { calls: usage._count._all, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

const queues = new Map<string, Promise<unknown>>();

/**
 * 真正调用前复查，避免整批导入先排队、后超额。配置月限时同一用户的模型调用串行，
 * 回填完成后才放行下一个；不同用户仍可并发。仅约束本进程，跨进程的在途请求可能超额。
 */
export async function runWithMonthlyTokenLimit<T>(operation: () => Promise<T>): Promise<T> {
    const context = getAiUsageContext();
    if (!context?.userId || context.admin || !((getAppConfig().aiMonthlyTokenLimit ?? 0) > 0)) return operation();
    const userId = context.userId;
    const run = (queues.get(userId) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        const limit = getAppConfig().aiMonthlyTokenLimit ?? 0;
        if (limit > 0 && isMonthlyTokenLimitReached((await getMonthlyAiUsage(userId, context.startedAt)).totalTokens, limit, false)) {
            throw new Error(MONTHLY_TOKEN_LIMIT_CODE);
        }
        return operation();
    });
    queues.set(userId, run);
    try { return await run; }
    finally { if (queues.get(userId) === run) queues.delete(userId); }
}
