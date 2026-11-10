"use client";

import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NoteCard } from '@/components/student/note-card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

interface MobileAnswerDrawerProps { id: string; children: ReactNode; footer: ReactNode; error?: string | null }
type DrawerSize = 'collapsed' | 'normal' | 'expanded';

/** 非模态作答面板，拖动只调整大小，按钮和方向键提供相同操作。 */
export function MobileAnswerDrawer({ id, children, footer, error }: MobileAnswerDrawerProps) {
    const { t } = useLanguage();
    const [size, setSize] = useState<DrawerSize>('normal');
    const drawer = useRef<HTMLDivElement>(null);
    const gesture = useRef<{ id: number; y: number } | null>(null);
    const dragged = useRef(false);
    useLayoutEffect(() => {
        const element = drawer.current;
        const layout = element?.closest<HTMLElement>('[data-review-layout]');
        if (!element || !layout) return;
        const viewport = window.visualViewport;
        const measure = () => {
            if (element.closest('[hidden]')) return;
            const height = viewport?.height ?? window.innerHeight;
            const inset = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
            layout.style.setProperty('--review-viewport-height', `${height}px`);
            layout.style.setProperty('--review-keyboard-inset', `${inset}px`);
            layout.style.setProperty('--review-drawer-height', `${element.getBoundingClientRect().height}px`);
        };
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(element);
        // 撤销或跳过返回时重新测量之前隐藏的草稿。
        const visibility = new MutationObserver(measure);
        visibility.observe(layout.parentElement ?? layout, { attributes: true, attributeFilter: ['hidden'] });
        window.addEventListener('resize', measure);
        viewport?.addEventListener('resize', measure);
        viewport?.addEventListener('scroll', measure);
        return () => {
            observer?.disconnect();
            visibility.disconnect();
            window.removeEventListener('resize', measure);
            viewport?.removeEventListener('resize', measure);
            viewport?.removeEventListener('scroll', measure);
            for (const name of ['--review-viewport-height', '--review-keyboard-inset', '--review-drawer-height']) layout.style.removeProperty(name);
        };
    }, []);
    return <div ref={drawer} className="review-drawer" data-drawer-size={size}>
        <NoteCard className="review-response">
            <Button type="button" variant="ghost" className="review-drawer-handle" aria-controls={`${id}-body`}
                aria-expanded={size !== 'collapsed'} aria-label={size === 'expanded' ? t.student.collapseAnswer : t.student.expandAnswer}
                onClick={event => {
                    if (dragged.current && event.detail > 0) { dragged.current = false; return; }
                    setSize(previous => previous === 'expanded' ? 'collapsed' : 'expanded');
                }}
                onKeyDown={event => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    setSize(event.key === 'ArrowUp' ? 'expanded' : 'collapsed');
                }}
                onPointerDown={event => {
                    if (event.button !== 0) return;
                    gesture.current = { id: event.pointerId, y: event.clientY };
                    dragged.current = false;
                    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 系统手势抢占时仍可通过按钮操作。 */ }
                }}
                onPointerUp={event => {
                    if (gesture.current?.id !== event.pointerId) return;
                    const delta = event.clientY - gesture.current.y;
                    if (Math.abs(delta) > 32) {
                        dragged.current = true;
                        setSize(delta < 0 ? 'expanded' : 'collapsed');
                    }
                    gesture.current = null;
                }}
                onPointerCancel={() => { gesture.current = null; }}
                onLostPointerCapture={() => { gesture.current = null; }}>
                <span aria-hidden="true" className="h-1 w-10 rounded-full bg-current opacity-30" />
            </Button>
            <div id={`${id}-body`} className="review-answer-body">{children}</div>
            {size === 'collapsed' && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {footer}
        </NoteCard>
    </div>;
}
