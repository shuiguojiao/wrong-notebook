import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api-handler";
import { badRequest, notFound, tooManyRequests } from "@/lib/api-errors";
import { getAppTimeZone } from "@/lib/config";
import { getDayRange } from "@/lib/date-time";
import { runSerializedTransaction } from "@/lib/db-write-queue";
import { prisma } from "@/lib/prisma";
import { createReportSchema, REPORT_DAILY_LIMIT } from "@/lib/problem-reports/schema";
import { snapshotForReport, userReportSelect } from "@/lib/problem-reports/service";

export const GET = withUser(async (req, { user }) => {
    const parsed = z.string().min(1).max(100).safeParse(new URL(req.url).searchParams.get('errorItemId'));
    if (!parsed.success) return badRequest('Invalid errorItemId');
    const reports = await prisma.problemReport.findMany({
        where: { userId: user.id, errorItemId: parsed.data },
        select: userReportSelect, orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(reports);
});

export const POST = withUser(async (req, { user }) => {
    const parsed = createReportSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest('Invalid problem report');
    const { errorItemId, category, description } = parsed.data;
    const now = new Date();
    const { start, end } = getDayRange(now, getAppTimeZone());
    return runSerializedTransaction(async tx => {
        // 先取得写锁，避免多进程同时读取额度后再升级写事务；更新同值不触发 updatedAt。
        await tx.$executeRaw`UPDATE "User" SET "id" = "id" WHERE "id" = ${user.id}`;
        const snapshot = await snapshotForReport(tx, user.id, errorItemId);
        if (!snapshot) return notFound();
        const count = await tx.problemReport.count({ where: { userId: user.id, createdAt: { gte: start, lt: end } } });
        if (count >= REPORT_DAILY_LIMIT) return tooManyRequests(end.getTime() - now.getTime(), 'Daily report limit reached');
        const report = await tx.problemReport.create({
            data: { userId: user.id, errorItemId, category, description, snapshot: JSON.stringify(snapshot), createdAt: now },
            select: userReportSelect,
        });
        return NextResponse.json(report, { status: 201 });
    });
});
