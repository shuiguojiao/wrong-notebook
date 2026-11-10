"use client";

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface PaperScrollbarProps { viewport: RefObject<HTMLDivElement | null>; height?: number; controls: string }

/** 独立触摸轨道让手指书写模式下的 iPad 也能可靠滚动纸张。 */
export function PaperScrollbar({ viewport, height, controls }: PaperScrollbarProps) {
    const { t } = useLanguage();
    const [position, setPosition] = useState(0);
    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const update = () => setPosition(element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight));
        element.addEventListener('scroll', update);
        update();
        return () => element.removeEventListener('scroll', update);
    }, [viewport, height]);
    const scroll = (value: number) => {
        const element = viewport.current;
        if (element) element.scrollTo({ top: value * (element.scrollHeight - element.clientHeight) });
    };
    return <div role="scrollbar" tabIndex={0} aria-label={t.handwriting.paperScroll} aria-orientation="vertical"
        aria-controls={controls} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(position * 100)}
        className="relative w-6 shrink-0 rounded-md bg-muted touch-none select-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.getBoundingClientRect(); scroll(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))); }}
        onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = event.currentTarget.getBoundingClientRect(); scroll(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))); }}
        onKeyDown={event => {
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : event.key === 'ArrowDown' || event.key === 'PageDown' ? position + 0.1 : event.key === 'ArrowUp' || event.key === 'PageUp' ? position - 0.1 : null;
            if (next === null) return;
            event.preventDefault(); scroll(Math.max(0, Math.min(1, next)));
        }}>
        <div className="absolute inset-x-1 h-11 rounded-full bg-muted-foreground/60" style={{ top: `calc(${position * 100}% - ${position * 44}px)` }} />
    </div>;
}
