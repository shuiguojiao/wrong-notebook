import "server-only";

import { storeImage } from "@/lib/image-storage";
import type { ImportContext } from "./types";

/** 出处页按目标用户与哈希复用，区域始终通过本次导入的 ID 映射重建。 */
export async function importSourcePages(ctx: ImportContext): Promise<void> {
    const { tx, user, importAll, normalized, errorItemIdMap } = ctx;
    if (normalized.data.version < 17) return;
    const pageIdMap = new Map<string, string>();
    for (const page of normalized.data.sourcePages ?? []) {
        const userId = importAll ? page.userId : user.id;
        // 即使已存在同哈希的页，也先恢复文件，修复丢图后的重复导入。
        const imageUrl = await storeImage(page.imageUrl);
        const existing = await tx.sourcePage.findUnique({
            where: { userId_sha256: { userId, sha256: page.sha256 } },
        });
        const restored = existing ?? await tx.sourcePage.create({
            data: {
                userId,
                sha256: page.sha256,
                imageUrl,
                width: page.width,
                height: page.height,
                origin: page.origin,
                fileName: page.fileName,
                pageNumber: page.pageNumber,
                createdAt: new Date(page.createdAt),
            },
        });
        if (existing && imageUrl && existing.imageUrl !== imageUrl) {
            await tx.sourcePage.update({ where: { id: existing.id }, data: { imageUrl } });
        }
        pageIdMap.set(page.id, restored.id);
    }
    for (const region of normalized.data.questionRegions ?? []) {
        const errorItemId = errorItemIdMap.get(region.errorItemId);
        const pageId = pageIdMap.get(region.pageId);
        // 格式校验已检查备份内的引用，这里只允许映射后的同用户实体相连。
        if (!errorItemId || !pageId) throw new Error('INVALID_SOURCE_REFERENCE');
        const item = await tx.errorItem.findUniqueOrThrow({ where: { id: errorItemId }, select: { userId: true } });
        const page = await tx.sourcePage.findUniqueOrThrow({ where: { id: pageId }, select: { userId: true } });
        if (item.userId !== page.userId) throw new Error('INVALID_SOURCE_OWNER');
        const data = { errorItemId, pageId, order: region.order, x: region.x, y: region.y, width: region.width, height: region.height };
        // 重复导入或题目判重合并时，保留现有区域，不重复添加同一位置。
        if (!(await tx.questionRegion.findFirst({ where: data }))) {
            await tx.questionRegion.create({ data });
        }
    }
}
