import "server-only";

import { imageDataUrl } from "@/lib/image-storage";
import { createLogger } from "@/lib/logger";
import type { ImageTransform } from "@/lib/image-storage";

const logger = createLogger("backup:image-export");

/** 每次导出独立计数；仅容忍文件不存在和内容校验失败，不影响普通图片读取。 */
export function createImageExporter() {
    let missingImages = 0;
    const read: ImageTransform = async (image, context) => {
        try {
            return await imageDataUrl(image);
        } catch (error) {
            const code = error instanceof Error && error.message === "IMAGE_CHECKSUM_MISMATCH"
                ? "IMAGE_CHECKSUM_MISMATCH"
                : error && typeof error === "object" && "code" in error ? error.code : undefined;
            if (code !== "ENOENT" && code !== "IMAGE_CHECKSUM_MISMATCH") throw error;
            missingImages += 1;
            // 不传入异常对象，避免文件路径或图片内容进入日志。
            logger.warn({ recordId: context.recordId, field: context.field, code }, "导出时跳过缺失或损坏的图片");
            return "";
        }
    };
    return { read, get missingImages() { return missingImages; } };
}
