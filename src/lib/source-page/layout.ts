import "server-only";

import { z } from "zod";
import { padRegion, stackLayout } from "@/lib/import/batch-crop";
import { computeOutputSize } from "@/lib/import/question-images";
import { draftRegionSchema, MAX_ITEM_REGIONS } from "@/lib/question-split/draft";
import type { DraftRegion } from "@/lib/question-split/draft";

export const sourceRegionsSchema = z.array(draftRegionSchema).min(1).max(MAX_ITEM_REGIONS);

/** 与浏览器按整页裁图采用相同边距、像素取整、左对齐与纵向间隔。 */
export function sourceCropLayout(width: number, height: number, regions: DraftRegion[]) {
    const crops = sourceRegionsSchema.parse(regions).map((region) => {
        const padded = padRegion(region);
        const x = Math.round(padded.x * width);
        const y = Math.round(padded.y * height);
        return {
            x, y,
            width: Math.min(width - x, Math.max(1, Math.round(padded.width * width))),
            height: Math.min(height - y, Math.max(1, Math.round(padded.height * height))),
        };
    });
    const layout = stackLayout(crops);
    return { crops, ...layout, output: computeOutputSize(layout.width, layout.height) };
}
