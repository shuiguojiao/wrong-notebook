"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { drawPaper, drawStrokes } from '@/lib/handwriting/render';
import { acceptsPointer, appendPoint, autoExtendPaper, canvasPixelRatio, changeStrokes, eraseAt, PAGE_WIDTH, pageTransform, penPressure } from '@/lib/handwriting/strokes';
import type { InkHistory, InkPoint, InkStroke, PaperBackground } from '@/lib/handwriting/strokes';

interface InkCanvasOptions {
    history: InkHistory;
    onChange: (history: InkHistory) => void;
    readOnly: boolean;
    pencilOnly: boolean;
    onPen: () => void;
    onPenActivity?: (down: boolean) => void;
    eraser: boolean;
    size: number;
    color: string;
    background: PaperBackground;
}
interface Gesture { id: number; type: string; stroke: InkStroke; strokes: InkStroke[] }

export function useInkCanvas({ history, onChange, readOnly, pencilOnly, onPen, onPenActivity, eraser, size, color, background }: InkCanvasOptions) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const active = useRef<Gesture | null>(null);
    const [preview, setPreview] = useState<InkStroke[] | null>(null);
    // 两笔间隔短于一次渲染时，props 中的 history 仍是旧值；用 ref 保存最新笔迹，避免后一笔覆盖前一笔。
    const latest = useRef(history);
    useLayoutEffect(() => { latest.current = history; }, [history]);
    const finish = () => {
        const gesture = active.current;
        if (!gesture) return;
        active.current = null;
        const strokes = eraser ? gesture.strokes : gesture.stroke.points.length ? [...gesture.strokes, gesture.stroke] : gesture.strokes;
        latest.current = changeStrokes(latest.current, strokes);
        onChange(latest.current);
        setPreview(null);
        if (gesture.type === 'pen') onPenActivity?.(false);
    };
    const discard = () => { active.current = null; setPreview(null); };
    const finishCurrent = useEffectEvent(finish);
    const discardCurrent = useEffectEvent(discard);
    useEffect(() => {
        const element = canvas.current;
        const touch = (event: TouchEvent) => {
            if (!readOnly && Array.from(event.changedTouches).some(touch => (touch as Touch & { touchType?: string }).touchType === 'stylus')) event.preventDefault();
        };
        const end = (event: PointerEvent) => {
            if (active.current?.id !== event.pointerId) return;
            if (event.type === 'pointercancel' && active.current.type !== 'pen') discardCurrent(); else finishCurrent();
        };
        const visibility = () => { if (document.hidden) finishCurrent(); };
        element?.addEventListener('touchstart', touch, { passive: false });
        element?.addEventListener('touchmove', touch, { passive: false });
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
        document.addEventListener('visibilitychange', visibility);
        return () => {
            element?.removeEventListener('touchstart', touch);
            element?.removeEventListener('touchmove', touch);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [readOnly]);
    useEffect(() => {
        const draw = () => {
            const element = canvas.current;
            if (!element) return;
            const { width, height } = element.getBoundingClientRect();
            if (!width || !height) return;
            const ratio = canvasPixelRatio(width, height, window.devicePixelRatio || 1);
            element.width = Math.floor(width * ratio); element.height = Math.floor(height * ratio);
            const context = element.getContext('2d');
            if (!context) return;
            const view = pageTransform(width, height);
            context.scale(ratio, ratio);
            context.fillStyle = '#f1f5f9'; context.fillRect(0, 0, width, height);
            context.translate(view.x, view.y); context.scale(view.scale, view.scale);
            drawPaper(context, background, view.paper.height);
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
            Math.max(0, Math.min(view.paper.height, (event.clientY - rect.top - view.y) / view.scale)), active.current?.type === 'pen' ? penPressure(event.pressure) : event.pressure];
    };
    const sample = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const gesture = active.current;
        if (!gesture || gesture.id !== event.pointerId) return;
        const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
        for (const sample of events.length ? events : [event]) {
            const point = pointOf(sample);
            if (eraser) gesture.strokes = eraseAt(gesture.strokes, point);
            else {
                gesture.stroke = { ...gesture.stroke, points: appendPoint(gesture.stroke.points, point) };
                const height = latest.current.paperHeight ?? pageTransform(canvas.current!.getBoundingClientRect().width, canvas.current!.getBoundingClientRect().height).paper.height;
                const paperHeight = autoExtendPaper(height, point[1]);
                if (paperHeight !== height) {
                    latest.current = { ...latest.current, paperHeight };
                    onChange(latest.current);
                }
            }
        }
        setPreview(eraser ? gesture.strokes : [...gesture.strokes, gesture.stroke]);
    };
    return {
        canvas,
        onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => {
            if (readOnly || event.button !== 0 || !acceptsPointer(event.pointerType, pencilOnly, active.current?.type)) return;
            if (active.current) {
                if (event.pointerType !== 'pen') return;
                // 笔优先：手掌（touch）未完成的笔画直接丢弃；卡住的上一笔 Pencil 手势则先保存。
                if (active.current.type === 'pen') finish();
                else discard();
            }
            event.preventDefault();
            if (event.pointerType === 'pen') { onPen(); onPenActivity?.(true); }
            // 新笔接续时先保存旧手势，再捕获 Pencil；书写中的手掌输入由 acceptsPointer 拦截。
            active.current = { id: event.pointerId, type: event.pointerType, strokes: latest.current.strokes,
                stroke: { points: [], size, color, pen: event.pointerType === 'pen' } };
            // 指针已失效（如系统手势抢占）时捕获会抛错；不捕获也能继续记录本笔，不能因此丢失笔迹。
            try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 忽略，继续采样 */ }
            sample(event);
        },
        onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => {
            if (readOnly || active.current?.id !== event.pointerId) return;
            event.preventDefault(); sample(event);
        },
        onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => {
            if (active.current?.id !== event.pointerId) return;
            // 抬笔压力通常为零，只保存已采样的点。
            finish();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        },
        // 系统取消时，Pencil 已写的部分保留，手指/手掌的笔画丢弃。
        onPointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => { if (active.current?.id === event.pointerId) { if (active.current.type === 'pen') finish(); else discard(); } },
        onLostPointerCapture: (event: ReactPointerEvent<HTMLCanvasElement>) => { if (active.current?.id === event.pointerId) finish(); },
    };
}
