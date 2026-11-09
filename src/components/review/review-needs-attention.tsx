"use client";

import { ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ReviewNeedsAttentionProps {
    count: number;
    onOpen?: () => void;
}

/** 数量与打开动作由调用方提供，核对数据将在 C3 接入。 */
export function ReviewNeedsAttention({ count, onOpen }: ReviewNeedsAttentionProps) {
    const { t } = useLanguage();
    if (count <= 0) return null;

    return <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-amber-950 transition-colors hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/70">
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-amber-400" />
        <span className="min-w-0 flex-1">{t.review.needsAttention.replace('{count}', String(count))}</span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
    </button>;
}
