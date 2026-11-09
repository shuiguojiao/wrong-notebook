import "server-only";

import { checkContext } from "@/lib/question/check-metadata";
import { parseCheckIssues } from "@/lib/question/check-store";

/** 比例分母与样本数一起返回；旧数据没有计时信息时不以零补齐。 */
export function calculateIntegrityStats(rows: Array<{ createdAt: Date; checkIssues: string | null }>, start: Date, end: Date) {
    let imports = 0, flaggedImports = 0, durationMs = 0, timedActions = 0, timedQuestions = 0;
    const byType: Record<string, { handled: number; dismissed: number; dismissRate: number }> = Object.create(null);
    for (const row of rows) {
        const context = checkContext(parseCheckIssues(row.checkIssues));
        if (!context) continue;
        if (context.origin === "import" && row.createdAt >= start && row.createdAt < end) {
            imports++;
            if (context.importIssueCodes?.length) flaggedImports++;
        }
        const timed = new Set<string>();
        for (const event of context.handling ?? []) {
            const date = new Date(event.at);
            if (date < start || date >= end || !Number.isFinite(date.getTime())) continue;
            const type = byType[event.code] ??= { handled: 0, dismissed: 0, dismissRate: 0 };
            type.handled++;
            if (event.action === "dismiss") type.dismissed++;
            const actionKey = JSON.stringify([event.at, event.action]);
            if (event.durationMs !== undefined && !timed.has(actionKey)) {
                timed.add(actionKey); durationMs += event.durationMs; timedActions++;
            }
        }
        if (timed.size) timedQuestions++;
    }
    for (const type of Object.values(byType)) type.dismissRate = type.dismissed / type.handled;
    return { imports, flaggedImports, flaggedImportRate: imports ? flaggedImports / imports : null, byType,
        timedActions, timedQuestions, averageHandlingMs: timedQuestions ? durationMs / timedQuestions : null };
}
