import "server-only";

import { AsyncLocalStorage } from 'node:async_hooks';
import { serializeWrite } from '@/lib/db-write-queue';
import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { ModelTokenUsage } from '@/lib/ai/token-usage';

interface UsageContext { id?: string }
const storage = new AsyncLocalStorage<UsageContext>();
const logger = createLogger('ai-usage');

/** 每个请求/导入操作一个独立容器；不能用 enterWith，以免污染相邻请求。 */
export function withAiUsageScope<T>(operation: () => T): T {
    return storage.run({}, operation);
}

export function setAiUsageId(id: string | undefined): void {
    const context = storage.getStore();
    if (context) context.id = id;
}

/** 后台批次循环可能继续消费额度，因此调度时固定当前记录，而非共享可变容器。 */
export function captureAiUsage<T>(operation: () => T): () => T {
    const context = { ...storage.getStore() };
    return () => storage.run({ ...context }, operation);
}

export async function recordAiTokens(usage: ModelTokenUsage): Promise<void> {
    const id = storage.getStore()?.id;
    if (!id) return;
    try {
        await serializeWrite(() => prisma.$transaction(async tx => {
            const row = await tx.aiUsage.findUnique({ where: { id } });
            if (!row) return;
            const details: ModelTokenUsage[] = row.tokenBreakdown ? JSON.parse(row.tokenBreakdown) : [];
            details.push(usage);
            const sum = (key: 'inputTokens' | 'outputTokens') => details.every(item => item[key] === null) ? null : details.reduce((n, item) => n + (item[key] ?? 0), 0);
            await tx.aiUsage.update({ where: { id }, data: {
                provider: details.every(item => item.provider === usage.provider) ? usage.provider : null,
                model: details.every(item => item.model === usage.model) ? usage.model : null,
                inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), tokenBreakdown: JSON.stringify(details),
            } });
        }));
    } catch {
        // 只记录记录编号；SDK 错误可能包含请求正文，不把它写入统计日志。
        logger.warn({ usageId: id }, 'AI token 统计写入失败');
    }
}
