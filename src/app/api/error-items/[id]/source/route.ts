import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import { notFound } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import type { SourceRegion } from "@/lib/question/source-view";

/** 仅返回本人题目的出处，内部图片引用统一转换为鉴权地址。 */
export const GET = withUser<{ params: Promise<{ id: string }> }>(async (_req, { user, params }) => {
    const { id } = await params;
    const item = await prisma.errorItem.findFirst({
        where: { id, userId: user.id },
        select: { updatedAt: true, questionRegions: {
            where: { page: { userId: user.id } },
            orderBy: [{ order: "asc" }, { id: "asc" }],
            select: { x: true, y: true, width: true, height: true, order: true, page: {
                select: { id: true, width: true, height: true, fileName: true, pageNumber: true, origin: true, createdAt: true },
            } },
        } },
    });
    if (!item) return notFound("Item not found");
    type Page = typeof item.questionRegions[number]["page"];
    const pages: Array<{ page: Page & { imageUrl: string }; regions: SourceRegion[] }> = [];
    for (const { page, ...region } of item.questionRegions) {
        let entry = pages.find(entry => entry.page.id === page.id);
        if (!entry) {
            const imageUrl = `/api/error-items/${encodeURIComponent(id)}/image?sourcePage=${encodeURIComponent(page.id)}&v=${page.createdAt.getTime()}`;
            entry = { page: { ...page, imageUrl }, regions: [] };
            pages.push(entry);
        }
        entry.regions.push(region);
    }
    return NextResponse.json({ page: pages[0]?.page ?? null, regions: pages[0]?.regions ?? [], ...(pages.length ? { updatedAt: item.updatedAt.toISOString() } : {}), ...(pages.length > 1 ? { pages } : {}) });
});
