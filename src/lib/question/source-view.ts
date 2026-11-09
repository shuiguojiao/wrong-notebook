export interface SourceRegion {
    x: number;
    y: number;
    width: number;
    height: number;
    order: number;
}

export interface SourcePageView {
    id: string;
    imageUrl: string;
    width: number;
    height: number;
    fileName: string | null;
    pageNumber: number | null;
    origin: string;
    createdAt: string;
}

export interface SourceView {
    /** 框选保存所用的题目版本，仅有出处时返回。 */
    updatedAt?: string;
    page: SourcePageView | null;
    regions: SourceRegion[];
    /** 跨页题保留首个 page/regions，同时提供全部出处。 */
    pages?: Array<{ page: SourcePageView; regions: SourceRegion[] }>;
}

export function sourceRegionStyle(region: SourceRegion) {
    return {
        left: `${region.x * 100}%`,
        top: `${region.y * 100}%`,
        width: `${region.width * 100}%`,
        height: `${region.height * 100}%`,
    };
}

/** 初始适配整页，并在不超过两倍整页缩放的范围内居中第一框。 */
export function initialSourceTransform(page: Pick<SourcePageView, 'width' | 'height'>, region: SourceRegion | undefined, width: number, height: number) {
    const fit = Math.min(width / page.width, height / page.height);
    const scale = region ? Math.min(fit * 2, width * 0.9 / (page.width * region.width), height * 0.8 / (page.height * region.height)) : fit;
    return {
        scale,
        x: width / 2 - page.width * (region ? region.x + region.width / 2 : 0.5) * scale,
        y: height / 2 - page.height * (region ? region.y + region.height / 2 : 0.5) * scale,
    };
}
