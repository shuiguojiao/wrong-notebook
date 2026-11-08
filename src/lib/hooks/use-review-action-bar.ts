"use client";

import { useLayoutEffect, useRef } from 'react';

/** 固定栏的实际高度包含错误提示和安全区；内容留位与操作栏同步，横屏内联时归零。 */
export function useReviewActionBar() {
    const bar = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const element = bar.current;
        const layout = element?.closest<HTMLElement>('[data-review-layout]');
        if (!element || !layout) return;
        const measure = () => {
            const height = getComputedStyle(element).position === 'fixed' ? element.getBoundingClientRect().height : 0;
            layout.style.setProperty('--review-action-height', `${height}px`);
        };
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(element);
        window.addEventListener('resize', measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measure);
            layout.style.removeProperty('--review-action-height');
        };
    }, []);
    return bar;
}
