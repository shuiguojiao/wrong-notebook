import "server-only";

import type { ImportContext } from "./types";

/** 报告独立于原题存在；仅使用此次导入的 ID 映射，且再次检查所有权。 */
export async function importProblemReports(ctx: ImportContext): Promise<void> {
    for (const report of ctx.normalized.data.problemReports ?? []) {
        const userId = ctx.importAll ? report.userId : ctx.user.id;
        const mappedId = report.errorItemId ? ctx.errorItemIdMap.get(report.errorItemId) : null;
        const item = mappedId ? await ctx.tx.errorItem.findFirst({ where: { id: mappedId, userId }, select: { id: true } }) : null;
        // 不接受备份覆盖已有报告，防止用户借导入接口改写管理员处理结果。
        const existing = await ctx.tx.problemReport.findFirst({ where: { id: report.id, userId } });
        if (existing) continue;
        await ctx.tx.problemReport.create({ data: {
            userId, errorItemId: item?.id ?? null,
            category: report.category, description: report.description, snapshot: report.snapshot,
            status: report.status, adminNote: report.adminNote,
            createdAt: new Date(report.createdAt), updatedAt: new Date(report.updatedAt),
        } });
        ctx.stats.problemReportsCreated++;
    }
}
