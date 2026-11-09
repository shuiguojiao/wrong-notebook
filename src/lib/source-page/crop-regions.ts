import "server-only";

import jpeg from "jpeg-js";
import { AgentInputError } from "@/lib/agent/errors";
import { stackLayout } from "@/lib/import/batch-crop";
import { computeOutputSize } from "@/lib/import/question-images";
import { readStoredImage } from "@/lib/image-storage";
import { cropSourceImage } from "@/lib/source-page/crop";
import type { DraftRegion } from "@/lib/question-split/draft";

type SourceRegionImage = DraftRegion & { page: { imageUrl: string } };

/** 出处有跨页区域但没有现成题图时，按题目的阅读顺序拼接全部区域。 */
export async function imageFromSourceRegions(regions: SourceRegionImage[]) {
    const pieces = [];
    for (const region of regions) {
        const page = await readStoredImage(region.page.imageUrl);
        if (!page) throw new AgentInputError("AGENT_SOURCE_INVALID");
        pieces.push(jpeg.decode(cropSourceImage(page.bytes, page.mimeType, [region]), { useTArray: true }));
    }
    const layout = stackLayout(pieces);
    const { width, height } = computeOutputSize(layout.width, layout.height);
    const data = Buffer.alloc(width * height * 4, 255);
    const scale = width / layout.width;
    pieces.forEach((piece, index) => {
        const rect = layout.rects[index];
        const bottom = Math.min(height, Math.round((rect.y + rect.height) * scale));
        const right = Math.min(width, Math.round(rect.width * scale));
        const top = Math.round(rect.y * scale);
        for (let y = top; y < bottom; y++) for (let x = 0; x < right; x++) {
            const sx = Math.min(piece.width - 1, Math.floor(x / scale));
            const sy = Math.min(piece.height - 1, Math.floor((y - top) / scale));
            const offset = (sy * piece.width + sx) * 4;
            for (let c = 0; c < 3; c++) data[(y * width + x) * 4 + c] = piece.data[offset + c];
        }
    });
    const bytes = jpeg.encode({ data, width, height }, 85).data;
    return { bytes, mimeType: 'image/jpeg' };
}

