"use client";

import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DetailActionBarProps { children: ReactNode; desktopInline?: boolean }

/** 按操作栏实测高度留位，错误提示、安全区和大字号均不会遮住表单。 */
export function DetailActionBar({ children, desktopInline = false }: DetailActionBarProps) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const element = ref.current;
        const layout = element?.closest<HTMLElement>('[data-detail-layout]');
        if (!element || !layout) return;
        const measure = () => {
            const height = getComputedStyle(element).position === 'fixed' ? element.getBoundingClientRect().height : 0;
            layout.style.setProperty('--detail-action-height', `${height}px`);
        };
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(element);
        window.addEventListener('resize', measure);
        return () => { observer?.disconnect(); window.removeEventListener('resize', measure); layout.style.removeProperty('--detail-action-height'); };
    }, []);
    return <div ref={ref} className={cn("fixed inset-x-0 bottom-[var(--student-nav-height,0px)] left-[var(--student-sidebar-width,0px)] z-30 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]", desktopInline && "lg:static lg:border-0 lg:bg-transparent lg:p-0")}>
        {children}
    </div>;
}
