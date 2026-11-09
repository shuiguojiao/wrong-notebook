import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import { badRequest } from "@/lib/api-errors";
import { printImageUrl } from "@/lib/error-list/error-list-select";
import { prisma } from "@/lib/prisma";
import { parseCheckIssues } from "@/lib/question/check-store";
import { releaseDeferredChecks } from "@/lib/question/legacy-surface";
import { visibleCheckIssues } from "@/lib/question/pending-checks";

export const GET = withUser(async (req, { user }) => {
    const ids = new URL(req.url).searchParams.get("ids")?.split(",").filter(Boolean);
    if (ids && (ids.length > 500 || ids.some(id => id.length > 100))) return badRequest("CHECK_INVALID_IDS");
    await releaseDeferredChecks(user.id);
    const rows = await prisma.errorItem.findMany({
        where: { userId: user.id, checkStatus: "flagged", ...(ids ? { id: { in: ids } } : {}) },
        orderBy: [{ checkedAt: "asc" }, { id: "asc" }],
        select: { id: true, questionText: true, updatedAt: true, checkIssues: true, originalImageUrl: true,
            questionRegions: { where: { page: { userId: user.id } }, select: { id: true }, take: 1 } },
    });
    const items = rows.flatMap(row => {
        const issues = visibleCheckIssues(parseCheckIssues(row.checkIssues));
        return issues.length ? [{ id: row.id, preview: (row.questionText ?? "").slice(0, 160), updatedAt: row.updatedAt.toISOString(), issues,
            originalImageUrl: row.originalImageUrl ? printImageUrl(row.id, row.updatedAt) : "", hasSource: row.questionRegions.length > 0 }] : [];
    });
    return NextResponse.json({ total: items.length, items }, { headers: { "Cache-Control": "no-store" } });
});
