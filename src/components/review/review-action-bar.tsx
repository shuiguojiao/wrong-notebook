"use client";

import { useReviewActionBar } from '@/lib/hooks/use-review-action-bar';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface ReviewActionBarProps {
    children: ReactNode;
    className?: string;
    label?: string;
    busy?: boolean;
}

/** 提交和判题确认共用固定栏与高度测量，避免安全区或错误信息遮住正文。 */
export function ReviewActionBar({ children, className, label, busy }: ReviewActionBarProps) {
    const bar = useReviewActionBar();
    return <div ref={bar} aria-label={label} aria-busy={busy}
        className={cn('fixed inset-x-0 bottom-0 z-30 border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:landscape:static', className)}>
        {children}
    </div>;
}
