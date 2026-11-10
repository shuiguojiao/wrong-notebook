import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { internalError } from "@/lib/api-errors";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { createLogger } from "@/lib/logger";
import { ERROR_ITEM_LIST_SELECT, ERROR_ITEM_PRINT_SELECT, printImageUrl } from "@/lib/error-list/error-list-select";
import { parseErrorListQueryParams, buildErrorListWhere } from "@/lib/error-list/error-list-query";
import { masteryStatusOf } from "@/lib/mastery-status";
import { getReviewQueue } from "@/lib/review-due";

const logger = createLogger('api:error-items:list');

export const GET = withUser(async (req: Request, { user }: AuthenticatedContext) => {
    const { searchParams } = new URL(req.url);
    // 共用解析与查询支持 unmastered，响应仍返回原始三类单题状态。
    const params = parseErrorListQueryParams(searchParams);

    try {
        const whereClause = await buildErrorListWhere(params, user.id, user.masteryThreshold, prisma);

        // 获取总数
        const total = await prisma.errorItem.count({
            where: whereClause,
        });

        // 先取得队列快照，旧题的复习缓存回填完成后再读取下次日期。
        const today = params.view === "print" ? null : await getReviewQueue(user.id);

        // 分页查询
        const pageArgs = { where: whereClause, orderBy: { createdAt: "desc" as const }, skip: (params.page - 1) * params.pageSize, take: params.pageSize };
        const items = params.view === "print"
            ? await findPrintItems(pageArgs)
            : await withImageLinks(await prisma.errorItem.findMany({ ...pageArgs, select: ERROR_ITEM_LIST_SELECT }));

        const ids = items.map(item => item.id);
        const [figures, wrongCounts] = params.view === 'print' ? [[], []] : await Promise.all([
            prisma.errorItem.findMany({ where: { userId: user.id, id: { in: ids }, figureSvg: { contains: '<svg' } }, select: { id: true } }),
            prisma.practiceRecord.groupBy({ by: ['errorItemId'], where: { userId: user.id, errorItemId: { in: ids }, result: 'wrong' }, _count: { _all: true } }),
        ]);
        const figureIds = new Set(figures.map(item => item.id));
        const wrongById = new Map(wrongCounts.map(row => [row.errorItemId, row._count._all]));
        const todayIds = new Set(today?.entries.map(entry => entry.id));
        const totalPages = Math.ceil(total / params.pageSize);

        return NextResponse.json({
            items: items.map(({ _count, questionRegions, ...item }) => ({
                ...item,
                sourceFileName: questionRegions?.[0]?.page.fileName ?? null,
                ...(params.view === 'print' ? {} : {
                    hasSource: !!item.originalImageUrl || !!questionRegions?.length,
                    figurePreviewUrl: figureIds.has(item.id) ? `/api/error-items/${encodeURIComponent(item.id)}/figure` : undefined,
                    wrongCount: wrongById.get(item.id) ?? 0,
                    isDueToday: todayIds.has(item.id),
                }),
                masteryStatus: masteryStatusOf(_count.practiceRecords, item.masteryProbability, user.masteryThreshold),
            })),
            total,
            page: params.page,
            pageSize: params.pageSize,
            totalPages,
            ...(today ? { dueTodayCount: today.entries.filter(entry => !params.subjectId || entry.subjectId === params.subjectId).length } : {}),
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching items');
        return internalError("Failed to fetch error items");
    }
});

/**
 * 打印视图：读取解答与配图；base64 原图换成懒加载的图片接口链接，外部链接原样返回。
 * 原图类型只在 SQLite 中按前缀判断，不把 base64 读入服务端内存，也不随列表返回。
 */
async function findPrintItems(args: Pick<Prisma.ErrorItemFindManyArgs, "where" | "orderBy" | "skip" | "take">) {
    const rows = await prisma.errorItem.findMany({ ...args, select: ERROR_ITEM_PRINT_SELECT });
    return withImageLinks(rows);
}

/** 仅查询图片是否存在或为外链；默认列表和打印共用懒加载地址。 */
async function withImageLinks<T extends { id: string; updatedAt: Date }>(rows: T[]) {
    const ids = rows.map((row) => row.id);
    const isInline = { OR: [{ originalImageUrl: { startsWith: "data:" } }, { originalImageUrl: { startsWith: "local-image:" } }] };
    const [inline, external] = ids.length === 0 ? [[], []] : await Promise.all([
        prisma.errorItem.findMany({ where: { id: { in: ids }, ...isInline }, select: { id: true } }),
        prisma.errorItem.findMany({
            where: { id: { in: ids }, originalImageUrl: { not: "" }, NOT: isInline },
            select: { id: true, originalImageUrl: true },
        }),
    ]);
    const inlineIds = new Set(inline.map((row) => row.id));
    const externalUrls = new Map(external.map((row) => [row.id, row.originalImageUrl]));
    return rows.map(({ updatedAt, ...row }) => ({
        ...row,
        originalImageUrl: inlineIds.has(row.id) ? printImageUrl(row.id, updatedAt) : externalUrls.get(row.id) ?? "",
    }));
}
