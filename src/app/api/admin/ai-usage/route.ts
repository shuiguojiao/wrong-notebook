import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api-handler';
import { summarizeAiUsage } from '@/lib/ai-usage-stats';
import { getAppConfig, getAppTimeZone } from '@/lib/config';
import { formatDateTime, getMonthRange } from '@/lib/date-time';
import { prisma } from '@/lib/prisma';
import type { AdminAiUsageData } from '@/lib/ai-usage-stats';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async () => {
    const now = new Date();
    const timeZone = getAppTimeZone();
    const prices = getAppConfig().aiModelPrices ?? [];
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { createdAt: 'asc' } });
    const months = await Promise.all([0, -1].map(async offset => {
        const { start, end } = getMonthRange(now, timeZone, offset);
        const rows = await prisma.aiUsage.findMany({ where: { createdAt: { gte: start, lt: end } }, select: {
            userId: true, kind: true, provider: true, model: true, inputTokens: true, outputTokens: true, tokenBreakdown: true,
        } });
        return { month: formatDateTime(start, 'yyyy-MM', timeZone), start: start.toISOString(), end: end.toISOString(),
            total: summarizeAiUsage(rows, prices), users: users.map(user => ({ ...user, stats: summarizeAiUsage(rows.filter(row => row.userId === user.id), prices) })) };
    }));
    return NextResponse.json({ timeZone, months } satisfies AdminAiUsageData);
});
