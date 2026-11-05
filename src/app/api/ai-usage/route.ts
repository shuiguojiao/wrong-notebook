import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { countTodayAiUsage } from '@/lib/ai-quota';
import { summarizeAiUsage } from '@/lib/ai-usage-stats';
import { getAppConfig, getAppTimeZone } from '@/lib/config';
import { formatDateTime, getMonthRange } from '@/lib/date-time';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (_req, { user }) => {
    const now = new Date();
    const timeZone = getAppTimeZone();
    const { start, end } = getMonthRange(now, timeZone);
    const config = getAppConfig();
    const [rows, todayCalls] = await Promise.all([
        prisma.aiUsage.findMany({ where: { userId: user.id, createdAt: { gte: start, lt: end } }, select: {
            kind: true, provider: true, model: true, inputTokens: true, outputTokens: true, tokenBreakdown: true,
        } }), countTodayAiUsage(user.id, now),
    ]);
    const stats = summarizeAiUsage(rows);
    return NextResponse.json({ month: formatDateTime(start, 'yyyy-MM', timeZone), timeZone, calls: stats.calls,
        totalTokens: stats.inputTokens + stats.outputTokens, unknownActions: stats.unknownActions, todayCalls,
        dailyLimit: config.aiDailyLimit ?? 0, monthlyTokenLimit: config.aiMonthlyTokenLimit ?? 0, admin: user.role === 'admin' });
});
