import "server-only";

import { getIntegrityAIService } from '@/lib/ai';
import { parseErrorCode } from '@/lib/ai/error-classification';
import { consumeAiQuota } from '@/lib/ai-quota';
import { withAiUsageScope } from '@/lib/ai-usage-context';
import { reserveBackgroundTask, runReservedTask, describeQuestion } from '@/lib/background-tasks';
import { getAppConfig } from '@/lib/config';
import { runSerializedTransaction } from '@/lib/db-write-queue';
import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { mergeAiCheckIssues } from './check-store';
import { createDebouncedQueue } from './debounced-queue';
import { buildIntegrityInput, integrityFingerprint, integrityInclude } from './integrity-input';
import { integrityIssues } from './integrity-issues';

const logger = createLogger('question-integrity');
const retryable = new Set(['AI_RESPONSE_ERROR', 'AI_CONNECTION_FAILED', 'AI_TIMEOUT_ERROR', 'AI_SERVICE_UNAVAILABLE']);

async function check(id: string): Promise<void> {
    if (getAppConfig().integrityCheckEnabled === false) return;
    const item = await prisma.errorItem.findUnique({ where: { id }, include: integrityInclude });
    if (!item || (!item.originalImageUrl && !item.questionRegions.length)) return;
    const user = await prisma.user.findUnique({ where: { id: item.userId } });
    if (!user) return;
    const task = reserveBackgroundTask({ userId: user.id, kind: 'integrity_check', target: `error-item:${id}:integrity-check`,
        subject: describeQuestion(item), link: `/error-items/${id}` });
    if (!task) return;
    try {
        const input = await buildIntegrityInput(item);
        if (!input || getAppConfig().integrityCheckEnabled === false) { task.cancel(); return; }
        await withAiUsageScope(async () => {
            if (await consumeAiQuota(user, 'integrity_check')) { task.cancel(); return; }
            await runReservedTask(task, async () => {
                const { service, model } = getIntegrityAIService();
                let result;
                for (let attempt = 0; ; attempt++) {
                    try { result = await service.checkQuestionIntegrity(input); break; }
                    catch (error) {
                        if (attempt >= 1 || !retryable.has(parseErrorCode(error))) throw error;
                        // 重试属于同一后台操作，token 仍追加到同一条用量记录。
                    }
                }
                await runSerializedTransaction(async tx => {
                    const current = await tx.errorItem.findUnique({ where: { id }, include: integrityInclude });
                    if (!current || integrityFingerprint(current) !== integrityFingerprint(item)) return;
                    if (getAppConfig().integrityCheckEnabled === false) return;
                    await tx.errorItem.update({ where: { id }, data: mergeAiCheckIssues(current.checkIssues, integrityIssues(result), model) });
                });
                // 即使没有发现问题，也保留所用模型；实际返回模型另由 aiUsage 记录。
                logger.info({ errorItemId: id, model, taskId: task.id }, '图文核对完成');
            });
        });
    } catch (error) {
        if (parseErrorCode(error) === 'AI_MONTHLY_TOKEN_LIMIT_EXCEEDED') { task.cancel(); return; }
        task.fail(error);
        // SDK 错误可能带请求正文，只记录归类后的错误码。
        logger.warn({ errorItemId: id, code: parseErrorCode(error) }, '图文核对失败，可重新排队');
    }
}

const queue = createDebouncedQueue(check, (id, error) => {
    logger.warn({ errorItemId: id, code: parseErrorCode(error) }, '图文核对排队失败');
});

/** 必须在题目与出处关联事务提交成功后调用；不阻塞保存。 */
export function scheduleIntegrityCheck(id: string): void {
    queue.enqueue(id);
}

/** 测试结束时取消尚未启动的任务。 */
export function resetIntegrityQueueForTest(): void { queue.clear(); }
