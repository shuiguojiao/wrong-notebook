import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-handler";
import { getAppTimeZone } from "@/lib/config";
import { formatDateTime, getDayRange } from "@/lib/date-time";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { calculateIntegrityStats } from "@/lib/question/integrity-stats";

const logger = createLogger("integrity-daily-summary");

/** 只读当日汇总；不触发重检、放出或 AI，不注册定时任务。 */
export const GET = withAdmin(async () => {
    const now = new Date();
    const timeZone = getAppTimeZone();
    const { start, end } = getDayRange(now, timeZone);
    const rows = await prisma.errorItem.findMany({ where: { checkIssues: { not: null } }, select: { createdAt: true, checkIssues: true } });
    const summary = { day: formatDateTime(now, "yyyy-MM-dd", timeZone), timeZone, ...calculateIntegrityStats(rows, start, end) };
    logger.info(summary, "题目核对每日观察汇总");
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
});
