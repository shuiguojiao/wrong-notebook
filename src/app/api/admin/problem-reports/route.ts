import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-handler";
import { badRequest } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { reportFilterSchema, reportSnapshotSchema } from "@/lib/problem-reports/schema";
import { userReportSelect } from "@/lib/problem-reports/service";

export const GET = withAdmin(async req => {
    const parsed = reportFilterSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return badRequest('Invalid report filters');
    const { status, category, page } = parsed.data;
    const where = { status, category };
    const [rows, total] = await prisma.$transaction([
        prisma.problemReport.findMany({
            where, select: { ...userReportSelect, snapshot: true, user: { select: { name: true, email: true } } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20,
        }),
        prisma.problemReport.count({ where }),
    ]);
    return NextResponse.json({ reports: rows.map(row => ({ ...row, snapshot: reportSnapshotSchema.parse(JSON.parse(row.snapshot)) })), total });
});
