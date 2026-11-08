"use client";

import { useLayoutEffect, useRef } from 'react';

// 横屏 iPad 上画布位置较低，剩余视口可能只有两百多像素；保证足够的演算高度，不够时让页面滚动。
const MIN_INK_HEIGHT = 420;

/** 按画布实际位置扣除导航、题号与工具栏，宽屏优先用满剩余视口。 */
export function useInkViewport() {
    const container = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const element = container.current;
        if (!element) return;
        let frame = 0;
        const apply = () => {
            if (window.innerWidth < 1024) {
                element.style.removeProperty('--ink-height');
                return;
            }
            const top = element.getBoundingClientRect().top + window.scrollY;
            const next = `${Math.max(MIN_INK_HEIGHT, window.innerHeight - top - 16)}px`;
            // 只在变化时写入并推迟到下一帧，避免改高度又触发父元素 ResizeObserver 形成循环。
            if (element.style.getPropertyValue('--ink-height') !== next) element.style.setProperty('--ink-height', next);
        };
        const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(apply); };
        apply();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
        if (element.parentElement) observer?.observe(element.parentElement);
        window.addEventListener('resize', resize);
        return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', resize); };
    }, []);
    return container;
}
