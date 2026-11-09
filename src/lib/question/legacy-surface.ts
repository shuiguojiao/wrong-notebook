import "server-only";

import type { Prisma } from "@prisma/client";
import { getAppTimeZone } from "@/lib/config";
import { formatDateTime, getDayRange } from "@/lib/date-time";
import { runSerializedTransaction } from "@/lib/db-write-queue";
import { checkContext, withCheckContext } from "@/lib/question/check-metadata";
import { parseCheckIssues } from "@/lib/question/check-store";

import { parseSurfaceLedger } from "@/lib/question/surface-ledger";

export const LEGACY_DAILY_LIMIT = 3;

/** 只在真正放出时扣额度，离线多天也不会一次积累多日提醒。调用方须处于写事务。 */
export async function surfaceLegacyIssues(tx: Prisma.TransactionClient, userId: string, raw: string, now = new Date()): Promise<string> {
    const issues = parseCheckIssues(raw);
    const context = checkContext(issues);
    if (context?.origin !== "legacy" || context.surfacedAt || !issues.some(issue => issue.visibility === "user" && !issue.dismissed && !issue.resolved)) return raw;
    if (context.deferredUntil && new Date(context.deferredUntil) > now) return raw;
    const timeZone = getAppTimeZone();
    const day = formatDateTime(now, "yyyy-MM-dd", timeZone);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { integritySurfaceLedger: true } });
    const previous = parseSurfaceLedger(user.integritySurfaceLedger);
    const count = previous?.day === day ? previous.count : 0;
    if (count < LEGACY_DAILY_LIMIT) {
        await tx.user.update({ where: { id: userId }, data: { integritySurfaceLedger: JSON.stringify({ day, count: count + 1 }) } });
        return JSON.stringify(withCheckContext(issues, { ...context, surfacedAt: now.toISOString(), deferredUntil: undefined }));
    }
    return JSON.stringify(withCheckContext(issues, { ...context, deferredUntil: getDayRange(now, timeZone, 1).start.toISOString() }));
}

/** 读取统一入口时按发现顺序放出，所有过滤条件之外仍共用同一用户额度。 */
export async function releaseDeferredChecks(userId: string, now = new Date()) {
    await runSerializedTransaction(async tx => {
        const day = formatDateTime(now, "yyyy-MM-dd", getAppTimeZone());
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { integritySurfaceLedger: true } });
        const ledger = parseSurfaceLedger(user.integritySurfaceLedger);
        let remaining = LEGACY_DAILY_LIMIT - (ledger?.day === day ? ledger.count : 0);
        if (remaining <= 0) return;
        const rows = await tx.errorItem.findMany({ where: { userId, checkStatus: "flagged", checkIssues: { contains: '"legacy"' } },
            orderBy: [{ checkedAt: "asc" }, { id: "asc" }], select: { id: true, checkIssues: true, updatedAt: true } });
        rows.sort((a, b) => (checkContext(parseCheckIssues(a.checkIssues))?.observedAt ?? "").localeCompare(checkContext(parseCheckIssues(b.checkIssues))?.observedAt ?? "") || a.id.localeCompare(b.id));
        for (const row of rows) {
            if (remaining <= 0) break;
            const raw = row.checkIssues!;
            if (checkContext(parseCheckIssues(raw))?.surfacedAt) continue;
            const next = await surfaceLegacyIssues(tx, userId, raw, now);
            // 展示状态不是内容修订，不使核对卡片或代理的版本校验失效。
            if (next !== raw) {
                await tx.errorItem.update({ where: { id: row.id }, data: { checkIssues: next, updatedAt: row.updatedAt } });
                if (checkContext(parseCheckIssues(next))?.surfacedAt) remaining--;
            }
        }
    });
}
