"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { drawPaper, drawStrokes } from '@/lib/handwriting/render';
import { acceptsPointer, appendPoint, autoExtendPaper, canvasPixelRatio, changeStrokes, eraseAt, PAGE_WIDTH, penPressure } from '@/lib/handwriting/strokes';
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
interface Gesture { id: number; type: string; stroke: InkStroke; strokes: InkStroke[]; extended: boolean }

export function useInkCanvas({ history, onChange, readOnly, pencilOnly, onPen, onPenActivity, eraser, size, color, background }: InkCanvasOptions) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const surface = useRef<HTMLDivElement>(null);
    const active = useRef<Gesture | null>(null);
    // 已完成的笔迹缓存在离屏底图里；书写中每帧只复制底图再叠画当前这一笔，不触发 React 渲染。
    const base = useRef<HTMLCanvasElement | null>(null);
    const baseKey = useRef('');
    const baseDirty = useRef(true);
    const frame = useRef(0);
    // 两笔间隔短于一次渲染时，props 中的 history 仍是旧值；用 ref 保存最新笔迹，避免后一笔覆盖前一笔。
    const latest = useRef(history);
    useLayoutEffect(() => { latest.current = history; }, [history]);
    const finish = () => {
        const gesture = active.current;
        if (!gesture) return;
        active.current = null;
        const strokes = eraser ? gesture.strokes : gesture.stroke.points.length ? [...gesture.strokes, gesture.stroke] : gesture.strokes;
        latest.current = changeStrokes(latest.current, strokes);
        baseDirty.current = true; schedule();
        onChange(latest.current);
        if (gesture.type === 'pen') onPenActivity?.(false);
    };
    const discard = () => { active.current = null; baseDirty.current = true; schedule(); };
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
    /** 纸面外层相对画布的偏移：画布吸顶，滚动后外层上移，偏移即已滚过的纸面高度。 */
    const geometry = () => {
        const element = canvas.current;
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const top = surface.current?.getBoundingClientRect().top ?? rect.top;
        return { rect, scale: rect.width / PAGE_WIDTH, offset: Math.max(0, rect.top - top) };
    };
    const paint = () => {
        frame.current = 0;
        const element = canvas.current;
        const view = geometry();
        if (!element || !view) return;
        const { rect, scale, offset } = view;
        const ratio = canvasPixelRatio(rect.width, rect.height, window.devicePixelRatio || 1);
        const width = Math.max(1, Math.floor(rect.width * ratio)), height = Math.max(1, Math.floor(rect.height * ratio));
        // 只在尺寸变化时重设画布像素，重设会清空并重新分配位图。
        if (element.width !== width || element.height !== height) { element.width = width; element.height = height; }
        const context = element.getContext('2d');
        if (!context) return;
        const gesture = active.current;
        const committed = gesture && eraserRef.current ? gesture.strokes : latest.current.strokes;
        const paperHeight = latest.current.paperHeight ?? rect.height / scale;
        const key = `${width}x${height}@${offset}|${backgroundRef.current}|${paperHeight}`;
        if (!base.current) base.current = document.createElement('canvas');
        const cache = base.current;
        if (baseDirty.current || baseKey.current !== key) {
            if (cache.width !== width || cache.height !== height) { cache.width = width; cache.height = height; }
            const layer = cache.getContext('2d');
            if (!layer) return;
            layer.setTransform(ratio, 0, 0, ratio, 0, 0);
            layer.fillStyle = '#f1f5f9'; layer.fillRect(0, 0, rect.width, rect.height);
            layer.translate(0, -offset); layer.scale(scale, scale);
            drawPaper(layer, backgroundRef.current, paperHeight);
            drawStrokes(layer, committed);
            baseKey.current = key; baseDirty.current = false;
        }
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(cache, 0, 0);
        if (gesture && !eraserRef.current && gesture.stroke.points.length) {
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            context.translate(0, -offset); context.scale(scale, scale);
            drawStrokes(context, [gesture.stroke]);
        }
    };
    /** 同一帧内的多次请求合并为一次绘制。 */
    function schedule() {
        if (frame.current || typeof window === 'undefined') return;
        frame.current = requestAnimationFrame(paint);
    }
    const eraserRef = useRef(eraser);
    const backgroundRef = useRef(background);
    useLayoutEffect(() => { eraserRef.current = eraser; backgroundRef.current = background; baseDirty.current = true; schedule(); });
    const scheduleEvent = useEffectEvent(() => schedule());
    // 尺寸变化不频繁，立即重绘，避免转屏后先闪一帧旧尺寸。
    const paintNow = useEffectEvent(() => { cancelAnimationFrame(frame.current); paint(); });
    useEffect(() => {
        const element = canvas.current;
        const scroller = element?.closest('[data-ink-scroll]');
        const update = () => scheduleEvent();
        const resize = () => paintNow();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
        if (element) observer?.observe(element);
        scroller?.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', resize);
        window.addEventListener('orientationchange', resize);
        return () => {
            observer?.disconnect(); scroller?.removeEventListener('scroll', update);
            window.removeEventListener('resize', resize); window.removeEventListener('orientationchange', resize);
            cancelAnimationFrame(frame.current); frame.current = 0;
        };
    }, []);

    const pointOf = (event: { clientX: number; clientY: number; pressure: number }): { point: InkPoint; inside: boolean } => {
        const view = geometry();
        const rect = view?.rect ?? canvas.current!.getBoundingClientRect();
        const scale = view?.scale || 1;
        const paperHeight = latest.current.paperHeight ?? rect.height / scale;
        const x = (event.clientX - rect.left) / scale;
        const y = (event.clientY - rect.top + (view?.offset ?? 0)) / scale;
        const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        return { inside, point: [Math.max(0, Math.min(PAGE_WIDTH, x)), Math.max(0, Math.min(paperHeight, y)),
            active.current?.type === 'pen' ? penPressure(event.pressure) : event.pressure] };
    };
    const sample = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const gesture = active.current;
        if (!gesture || gesture.id !== event.pointerId) return;
        const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
        for (const sample of events.length ? events : [event]) {
            const { point, inside } = pointOf(sample);
            if (eraser) { gesture.strokes = eraseAt(gesture.strokes, point); baseDirty.current = true; continue; }
            gesture.stroke = { ...gesture.stroke, points: appendPoint(gesture.stroke.points, point) };
            // 只有笔真正落在纸面内、靠近底边时才续纸；划出纸外的点被夹在边缘，不能当成写到底部。
            if (!inside || gesture.extended) continue;
            const view = geometry();
            const height = latest.current.paperHeight ?? (view ? view.rect.height / view.scale : undefined);
            if (height === undefined) continue;
            const paperHeight = autoExtendPaper(height, point[1]);
            if (paperHeight !== height) {
                gesture.extended = true;
                latest.current = { ...latest.current, paperHeight };
                onChange(latest.current);
            }
        }
        schedule();
    };
    return {
        canvas,
        surface,
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
                stroke: { points: [], size, color, pen: event.pointerType === 'pen' }, extended: false };
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
