import "server-only";

import { isLocalImage } from "@/lib/image-storage";
import { printImageUrl } from "@/lib/error-list/error-list-select";

/** 数据库中的内部标识不直接暴露给浏览器，沿用带鉴权的图片接口。 */
export function withPublicImage<T extends { id: string; originalImageUrl: string; updatedAt: Date }>(item: T): T {
    return { ...item, originalImageUrl: isLocalImage(item.originalImageUrl) ? printImageUrl(item.id, item.updatedAt) : item.originalImageUrl };
}
