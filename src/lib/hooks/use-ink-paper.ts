"use client";

import { useEffectEvent, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import { MAX_PAPER_HEIGHT, paperSize } from '@/lib/handwriting/strokes';
import type { InkHistory } from '@/lib/handwriting/strokes';

/** 初次可见时确定纸高；后续视口变化只更新投影宽度。 */
export function useInkPaper(viewport: RefObject<HTMLDivElement | null>, history: InkHistory, onChange: (history: InkHistory) => void) {
    const [width, setWidth] = useState(0);
    const [viewHeight, setViewHeight] = useState(0);
    const measure = useEffectEvent(() => {
        const element = viewport.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const width = element.clientWidth || rect.width;
        const height = element.clientHeight || rect.height;
        setWidth(width); setViewHeight(height);
        if (history.paperHeight === undefined) onChange({ ...history, paperHeight: Math.min(MAX_PAPER_HEIGHT, paperSize(width, height).height) });
    });
    useLayoutEffect(() => {
        const frame = requestAnimationFrame(() => measure());
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
        if (viewport.current) observer?.observe(viewport.current);
        window.addEventListener('resize', measure);
        return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', measure); };
    }, [viewport]);
    return { width, viewHeight, height: history.paperHeight };
}
