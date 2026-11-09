import "server-only";

import { DEFAULT_IMAGE_LIMITS } from "@/lib/image-pipeline";

/** 整页保留原始字节，单独限制上传体积与解码前尺寸。 */
export const SOURCE_PAGE_MAX_BYTES = 10 * 1024 * 1024;
export const SOURCE_PAGE_MAX_LONG_EDGE = DEFAULT_IMAGE_LIMITS.maxLongEdge;
