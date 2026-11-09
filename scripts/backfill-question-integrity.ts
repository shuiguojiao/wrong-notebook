import "server-only";

import { getErrorMessage } from "../src/lib/error-message";
import { parseIntegrityBackfillOptions, runRateLimited } from "../src/lib/question/backfill-options";

async function main() {
    const options = parseIntegrityBackfillOptions(process.argv.slice(2));
    if (!process.env.DATABASE_URL) throw new Error("请显式设置 DATABASE_URL 后执行存量核对脚本。");
    const { prisma } = await import("../src/lib/prisma");
    const { CHECK_VERSION } = await import("../src/lib/question/check-rules");
    const { checkLegacyQuestion } = await import("../src/lib/question/legacy-check");
    const { waitForIntegrityQueue } = await import("../src/lib/question/integrity-queue");
    const stats = { selected: 0, checked: 0, skippedOrFailed: 0, flagged: 0, deferred: 0, rulesOnly: options.rulesOnly };
    try {
        const user = options.user ? await prisma.user.findFirst({ where: { OR: [{ id: options.user }, { email: options.user }] } }) : null;
        if (options.user && !user) throw new Error("未找到指定用户");
        const rows = await prisma.errorItem.findMany({ where: {
            ...(user ? { userId: user.id } : {}), ...(options.sourcePrefix ? { source: { startsWith: options.sourcePrefix } } : {}),
            OR: [{ checkedAt: null }, { checkVersion: null }, { checkVersion: { lt: CHECK_VERSION } }],
        }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: options.limit, select: { id: true, userId: true } });
        stats.selected = rows.length;
        await runRateLimited(rows, options.intervalMs, async row => {
            if (await checkLegacyQuestion(row.id, row.userId, options.rulesOnly)) stats.checked++; else stats.skippedOrFailed++;
            if (!options.rulesOnly) await waitForIntegrityQueue();
            const item = await prisma.errorItem.findUnique({ where: { id: row.id }, select: { checkStatus: true, checkIssues: true } });
            if (item?.checkStatus === "flagged") stats.flagged++;
            const { checkContext } = await import("../src/lib/question/check-metadata");
            const { parseCheckIssues } = await import("../src/lib/question/check-store");
            if (checkContext(parseCheckIssues(item?.checkIssues))?.deferredUntil) stats.deferred++;
        });
        process.stdout.write(JSON.stringify(stats) + "\n");
    } finally { await prisma.$disconnect(); }
}
main().catch((error: unknown) => { process.stderr.write(getErrorMessage(error) + "\n"); process.exitCode = 1; });
