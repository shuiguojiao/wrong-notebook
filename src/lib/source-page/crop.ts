import "server-only";

import jpeg from "jpeg-js";
import { AgentInputError } from "@/lib/agent/errors";
import { QUESTION_IMAGE_MAX_BYTES, QUESTION_IMAGE_QUALITY } from "@/lib/import/question-images";
import type { DraftRegion } from "@/lib/question-split/draft";
import { decodeSourceImage } from "./codec";
import { sourceCropLayout, sourceRegionsSchema } from "./layout";

/** 直接采样到最终尺寸，避免多区域拼接产生数倍于整页的中间像素缓冲区。 */
export function cropSourceImage(bytes: Buffer, mimeType: string, regions: DraftRegion[]): Buffer {
    // 区域先校验，随后才解码大图。
    if (!sourceRegionsSchema.safeParse(regions).success) throw new AgentInputError("AGENT_SOURCE_INVALID");
    const image = decodeSourceImage(bytes, mimeType);
    const full = sourceCropLayout(image.width, image.height, regions);
    let { width, height } = full.output;
    for (;;) {
        const data = Buffer.alloc(width * height * 4, 255);
        const scaleX = width / full.width;
        const scaleY = height / full.height;
        full.crops.forEach((crop, index) => {
            const rect = full.rects[index];
            const left = Math.round(rect.x * scaleX);
            const top = Math.round(rect.y * scaleY);
            const right = Math.min(width, Math.round((rect.x + rect.width) * scaleX));
            const bottom = Math.min(height, Math.round((rect.y + rect.height) * scaleY));
            for (let y = top; y < bottom; y++) {
                const sy = crop.y + Math.max(0, Math.min(crop.height - 1, (y - top + 0.5) / (bottom - top) * crop.height - 0.5));
                const y0 = Math.floor(sy);
                const y1 = Math.min(crop.y + crop.height - 1, y0 + 1);
                for (let x = left; x < right; x++) {
                    const sx = crop.x + Math.max(0, Math.min(crop.width - 1, (x - left + 0.5) / (right - left) * crop.width - 0.5));
                    const x0 = Math.floor(sx);
                    const x1 = Math.min(crop.x + crop.width - 1, x0 + 1);
                    const positions = [(y0 * image.width + x0) * 4, (y0 * image.width + x1) * 4, (y1 * image.width + x0) * 4, (y1 * image.width + x1) * 4];
                    const dx = sx - x0;
                    const dy = sy - y0;
                    const weights = [(1 - dx) * (1 - dy), dx * (1 - dy), (1 - dx) * dy, dx * dy];
                    for (let channel = 0; channel < 3; channel++) {
                        let value = 0;
                        for (let sample = 0; sample < 4; sample++) {
                            const alpha = image.data[positions[sample] + 3] / 255;
                            value += (image.data[positions[sample] + channel] * alpha + 255 * (1 - alpha)) * weights[sample];
                        }
                        data[(y * width + x) * 4 + channel] = Math.round(value);
                    }
                }
            }
        });
        const encoded = jpeg.encode({ data, width, height }, QUESTION_IMAGE_QUALITY * 100).data;
        if (encoded.length <= QUESTION_IMAGE_MAX_BYTES) return encoded;
        if (width === 1 && height === 1) throw new AgentInputError("AGENT_SOURCE_CROP_TOO_LARGE");
        width = Math.max(1, Math.floor(width * 0.85));
        height = Math.max(1, Math.floor(height * 0.85));
    }
}
