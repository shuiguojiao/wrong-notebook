"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { ReviewActionBar } from "@/components/review/review-action-bar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface FocusCardProps {
    title: string;
    /** 已完成的百分比，取值为 0～100。 */
    progress: number;
    onClose: () => void;
    children: ReactNode;
    closeLabel?: string;
    closeDisabled?: boolean;
    headerActions?: ReactNode;
    footer?: ReactNode;
    className?: string;
}

/** 固定操作栏沿用复习页的实测留位，避免多行按钮或安全区遮挡正文。 */
export function FocusCard({ title, progress, onClose, closeLabel, closeDisabled, children, headerActions, footer, className }: FocusCardProps) {
    const { t } = useLanguage();
    const percent = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;
    return (
        <section data-review-layout className={cn("space-y-4 pb-[var(--review-action-height,0px)]", className)}>
            <header className="space-y-2 pt-[env(safe-area-inset-top)]">
                <div className="grid grid-cols-[minmax(2.75rem,1fr)_minmax(0,3fr)_minmax(2.75rem,1fr)] items-center gap-2">
                    <Button type="button" variant="ghost" size="icon" className="size-11" onClick={onClose} disabled={closeDisabled} aria-label={closeLabel || t.common.close}>
                        <X className="size-5" aria-hidden="true" />
                    </Button>
                    <h2 aria-live="polite" className="text-center text-sm text-muted-foreground">{title}</h2>
                    <div className="flex min-w-0 justify-end">{headerActions}</div>
                </div>
                <Progress value={percent} aria-label={t.focusCard.progress} className="h-1 [&>div]:motion-reduce:transition-none" />
            </header>
            <div className="min-w-0 rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-6">{children}</div>
            {footer != null && <ReviewActionBar className="sm:px-6 lg:landscape:rounded-xl lg:landscape:border lg:landscape:bg-card lg:landscape:shadow-xs">{footer}</ReviewActionBar>}
        </section>
    );
}
