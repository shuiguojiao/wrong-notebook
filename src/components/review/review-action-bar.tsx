"use client";

import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { useReviewActionBar } from '@/lib/hooks/use-review-action-bar';
import { cn } from '@/lib/utils';

interface ReviewActionBarProps {
    children: ReactNode;
    className?: string;
    label?: string;
    busy?: boolean;
}

/** 提交和判题确认共用固定栏与高度测量，避免安全区或错误信息遮住正文。 */
export function ReviewActionBar({ children, className, label, busy }: ReviewActionBarProps) {
    const bar = useReviewActionBar();
    useLayoutEffect(() => {
        const element = bar.current;
        const layout = element?.closest<HTMLElement>('.review-session-layout');
        if (!element || !layout) return;
        // 提示是卡片的同级浮层，按当前可见操作栏的位置避让，包括横屏内联布局。
        const measure = () => {
            if (element.closest('[hidden]')) return;
            const bottom = Math.max(16, window.innerHeight - element.getBoundingClientRect().top + 12);
            layout.style.setProperty('--review-notice-bottom', `${bottom}px`);
        };
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(element);
        const visibility = new MutationObserver(measure);
        visibility.observe(layout, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, { passive: true });
        return () => {
            observer?.disconnect();
            visibility.disconnect();
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure);
        };
    }, [bar]);
    return <div ref={bar} aria-label={label} aria-busy={busy}
        className={cn('review-action-bar fixed bottom-0 z-30 bg-background pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:landscape:static lg:landscape:bg-transparent', className)}>
        {children}
    </div>;
}
