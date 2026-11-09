import type { PercentCrop } from "react-image-crop";
import { draftRegionSchema } from "@/lib/question-split/draft";
import type { DraftRegion } from "@/lib/question-split/draft";

export function toCrop(region: DraftRegion): PercentCrop {
    return { unit: "%", x: region.x * 100, y: region.y * 100, width: region.width * 100, height: region.height * 100 };
}

export function fromCrop(crop: PercentCrop): DraftRegion | null {
    const region = { x: crop.x / 100, y: crop.y / 100, width: crop.width / 100, height: crop.height / 100 };
    return draftRegionSchema.safeParse(region).success ? region : null;
}

