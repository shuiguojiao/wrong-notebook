"use client";

import { useState } from 'react';
import { QuestionFigure } from '@/components/question-figure';
import { HistorySheet } from '@/components/history/history-sheet';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { figureSvgToDataUri } from '@/lib/figure-svg';
import { useImageZoom } from '@/lib/hooks/use-image-zoom';

interface HistoryImagesProps { url?: string | null; svg?: string | null; label: string; scale?: number; align?: string }

export function HistoryImages({ url, svg, label, scale, align }: HistoryImagesProps) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    if (!url && !svg) return null;
    return <div className="space-y-2">
        {svg && <QuestionFigure svg={svg} scale={scale} align={align} />}
        {url && <button type="button" className="block min-h-11 w-full rounded-md focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setOpen(true)} aria-label={`${t.history.enlarge} · ${label}`}><img src={url} alt={label} className="max-h-60 max-w-full rounded-md bg-white object-contain" /></button>}
        {svg && <button type="button" className="min-h-11 text-sm text-primary underline" onClick={() => setOpen(true)}>{t.history.enlarge}</button>}
        <HistorySheet open={open} onClose={() => setOpen(false)} title={label}>
            <HistoryImageViewer src={svg ? figureSvgToDataUri(svg) : url!} label={label} />
        </HistorySheet>
    </div>;
}

/** 沿用原图的滚轮、双指和按钮缩放能力，按钮保持 44px 触控高度。 */
function HistoryImageViewer({ src, label }: { src: string; label: string }) {
    const { t } = useLanguage();
    const { containerRef, zoom, imageStyle, measureImage, zoomIn, zoomOut, reset } = useImageZoom({ maxWidth: '100%', maxHeight: '55dvh', height: 'auto' });
    return <div className="space-y-3">
        <div className="sticky top-0 flex gap-2 bg-card">
            <Button variant="outline" className="min-h-11" onClick={zoomOut} disabled={zoom <= 1}>{t.common.cropper.zoomOut}</Button>
            <Button variant="ghost" className="min-h-11" aria-label={t.common.cropper.resetZoom} onClick={reset}>{Math.round(zoom * 100)}%</Button>
            <Button variant="outline" className="min-h-11" onClick={zoomIn} disabled={zoom >= 5}>{t.common.cropper.zoomIn}</Button>
        </div>
        <div ref={containerRef} className="max-h-[60dvh] overflow-auto"><img src={src} alt={label} className="bg-white" style={imageStyle} onLoad={event => measureImage(event.currentTarget)} /></div>
    </div>;
}
