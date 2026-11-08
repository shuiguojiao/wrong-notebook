"use client";

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { drawPaper, drawStrokes } from '@/lib/handwriting/render';
import { acceptsPointer, appendPoint, changeStrokes, eraseAt, PAGE_HEIGHT, PAGE_WIDTH, pageTransform } from '@/lib/handwriting/strokes';
import type { InkHistory, InkPoint, InkStroke, PaperBackground } from '@/lib/handwriting/strokes';

interface InkCanvasOptions {
    history: InkHistory;
    onChange: (history: InkHistory) => void;
    readOnly: boolean;
    pencilOnly: boolean;
    onPen: () => void;
    eraser: boolean;
    size: number;
    color: string;
    background: PaperBackground;
}
interface Gesture { id: number; type: string; stroke: InkStroke; strokes: InkStroke[] }

export function useInkCanvas({ history, onChange, readOnly, pencilOnly, onPen, eraser, size, color, background }: InkCanvasOptions) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const active = useRef<Gesture | null>(null);
    const [preview, setPreview] = useState<InkStroke[] | null>(null);
    useEffect(() => {
        const draw = () => {
            const element = canvas.current;
            if (!element) return;
            const { width, height } = element.getBoundingClientRect();
            if (!width || !height) return;
            const ratio = window.devicePixelRatio || 1;
            element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
            const context = element.getContext('2d');
            if (!context) return;
            const view = pageTransform(width, height);
            context.scale(ratio, ratio);
            context.fillStyle = '#f1f5f9'; context.fillRect(0, 0, width, height);
            context.translate(view.x, view.y); context.scale(view.scale, view.scale);
            drawPaper(context, background);
            drawStrokes(context, preview ?? history.strokes);
        };
        const frame = requestAnimationFrame(draw);
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
        if (canvas.current) observer?.observe(canvas.current);
        window.addEventListener('resize', draw);
        window.addEventListener('orientationchange', draw);
        return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', draw); window.removeEventListener('orientationchange', draw); };
    }, [background, history.strokes, preview]);

    const pointOf = (event: { clientX: number; clientY: number; pressure: number }): InkPoint => {
        const rect = canvas.current!.getBoundingClientRect();
        const view = pageTransform(rect.width, rect.height);
        return [Math.max(0, Math.min(PAGE_WIDTH, (event.clientX - rect.left - view.x) / view.scale)),
            Math.max(0, Math.min(PAGE_HEIGHT, (event.clientY - rect.top - view.y) / view.scale)), event.pressure];
    };
    const sample = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const gesture = active.current;
        if (!gesture || gesture.id !== event.pointerId) return;
        const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
        for (const sample of events.length ? events : [event]) {
            const point = pointOf(sample);
            if (eraser) gesture.strokes = eraseAt(gesture.strokes, point);
            else gesture.stroke = { ...gesture.stroke, points: appendPoint(gesture.stroke.points, point) };
        }
        setPreview(eraser ? gesture.strokes : [...gesture.strokes, gesture.stroke]);
    };
    const cancel = () => { active.current = null; setPreview(null); };
    return {
        canvas,
        onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => {
            if (readOnly || event.button !== 0 || !acceptsPointer(event.pointerType, pencilOnly, active.current?.type)) return;
            if (active.current && !(event.pointerType === 'pen' && active.current.type === 'touch')) return;
            event.preventDefault();
            if (event.pointerType === 'pen') onPen();
            // 笔优先：丢弃尚未提交的手掌笔画，再捕获 Pencil。
            active.current = { id: event.pointerId, type: event.pointerType, strokes: history.strokes,
                stroke: { points: [], size, color, pen: event.pointerType === 'pen' } };
            event.currentTarget.setPointerCapture(event.pointerId);
            sample(event);
        },
        onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => {
            if (readOnly || active.current?.id !== event.pointerId) return;
            event.preventDefault(); sample(event);
        },
        onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => {
            const gesture = active.current;
            if (!gesture || gesture.id !== event.pointerId) return;
            // pointerup 的压力通常为零，不再采样，避免末端突然变粗。
            const strokes = eraser ? gesture.strokes : [...gesture.strokes, gesture.stroke];
            onChange(changeStrokes(history, strokes));
            cancel();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        },
        onPointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => { if (active.current?.id === event.pointerId) cancel(); },
        onLostPointerCapture: (event: ReactPointerEvent<HTMLCanvasElement>) => { if (active.current?.id === event.pointerId) cancel(); },
    };
}
