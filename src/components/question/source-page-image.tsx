"use client";

import { useId } from "react";
import { sourceRegionStyle } from "@/lib/question/source-view";
import type { SourceRegion } from "@/lib/question/source-view";

interface SourcePageImageProps {
    src: string;
    alt: string;
    regions: SourceRegion[];
    scale?: number;
    numbered?: boolean;
}

/** 遮罩使用并集挖空，重叠区域也保持明亮。边框宽度不随缩放变化。 */
export function SourcePageImage({ src, alt, regions, scale = 1, numbered = regions.length > 1 }: SourcePageImageProps) {
    const maskId = useId();
    return <div className="relative w-full">
        <img src={src} alt={alt} draggable={false} className="block h-auto w-full select-none" />
        {regions.length > 0 && <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
            <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1" height="1">
                <rect width="1" height="1" fill="white" />
                {regions.map(region => <rect key={region.order} {...sourceRect(region)} fill="black" />)}
            </mask></defs>
            <rect width="1" height="1" fill="black" opacity="0.35" mask={`url(#${maskId})`} />
            {regions.map(region => <rect key={region.order} {...sourceRect(region)} fill="none" className="stroke-blue-600" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
        </svg>}
        {numbered && regions.map(region => <span key={region.order} data-source-region={region.order}
            className="pointer-events-none absolute" style={sourceRegionStyle(region)}>
            <span className="absolute left-0 top-0 flex size-6 origin-top-left items-center justify-center rounded-br-md bg-blue-600 text-xs font-semibold text-white"
                style={{ transform: `scale(${1 / scale})` }}>{region.order + 1}</span>
        </span>)}
    </div>;
}

function sourceRect({ x, y, width, height }: SourceRegion) {
    return { x, y, width, height, rx: 0.008 };
}
