"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { initialSourceTransform } from "@/lib/question/source-view";
import type { SourcePageView, SourceRegion } from "@/lib/question/source-view";

interface Point { x: number; y: number }
interface Transform extends Point { scale: number }

export function useSourceTransform(page: SourcePageView, regions: SourceRegion[]) {
    const viewport = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
    const current = useRef(transform);
    const pointers = useRef(new Map<number, Point>());
    const update = useCallback((next: Transform) => { current.current = next; setTransform(next); }, []);
    const reset = useCallback(() => {
        const element = viewport.current;
        if (element?.clientWidth && element.clientHeight) update(initialSourceTransform(page, regions[0], element.clientWidth, element.clientHeight));
    }, [page, regions, update]);
    const zoom = useCallback((factor: number, point?: Point) => {
        const element = viewport.current;
        if (!element) return;
        const before = current.current;
        const fit = Math.min(element.clientWidth / page.width, element.clientHeight / page.height) || 1;
        const scale = Math.min(fit * 12, Math.max(fit * 0.5, before.scale * factor));
        const center = point ?? { x: element.clientWidth / 2, y: element.clientHeight / 2 };
        update({
            scale,
            x: center.x - (center.x - before.x) * scale / before.scale,
            y: center.y - (center.y - before.y) * scale / before.scale,
        });
    }, [page.width, page.height, update]);
    useEffect(() => {
        reset();
        const element = viewport.current;
        if (!element) return;
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const bounds = element.getBoundingClientRect();
            zoom(Math.exp(-event.deltaY * 0.002), { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
        };
        element.addEventListener('wheel', wheel, { passive: false });
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reset);
        observer?.observe(element);
        return () => { element.removeEventListener('wheel', wheel); observer?.disconnect(); };
    }, [reset, zoom]);
    const move = (event: ReactPointerEvent<HTMLDivElement>) => {
        const previous = pointers.current.get(event.pointerId);
        if (!previous) return;
        const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
        const next = { x: event.clientX, y: event.clientY };
        if (other) {
            const distance = Math.hypot(previous.x - other.x, previous.y - other.y);
            const bounds = event.currentTarget.getBoundingClientRect();
            if (distance > 0) zoom(Math.hypot(next.x - other.x, next.y - other.y) / distance, {
                x: (previous.x + other.x) / 2 - bounds.left,
                y: (previous.y + other.y) / 2 - bounds.top,
            });
        }
        const divisor = other ? 2 : 1;
        update({ ...current.current, x: current.current.x + (next.x - previous.x) / divisor, y: current.current.y + (next.y - previous.y) / divisor });
        pointers.current.set(event.pointerId, next);
    };
    const pan = (x: number, y: number) => update({ ...current.current, x: current.current.x + x, y: current.current.y + y });
    return { viewport, transform, zoom, reset, pan, handlers: {
        onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        },
        onPointerMove: move,
        onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => pointers.current.delete(event.pointerId),
        onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => pointers.current.delete(event.pointerId),
        onLostPointerCapture: (event: ReactPointerEvent<HTMLDivElement>) => pointers.current.delete(event.pointerId),
    } };
}
