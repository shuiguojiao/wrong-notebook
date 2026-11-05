import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-handler";
import { badRequest, notFound } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { updateReportSchema } from "@/lib/problem-reports/schema";

export const PATCH = withAdmin<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
    const { id } = await params;
    const parsed = updateReportSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success || !id || id.length > 100) return badRequest('Invalid report update');
    const result = await prisma.problemReport.updateMany({ where: { id }, data: parsed.data });
    if (!result.count) return notFound();
    return NextResponse.json({ success: true });
});
