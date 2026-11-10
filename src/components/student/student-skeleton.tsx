"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export interface StudentSkeletonProps {
    variant?: "line" | "block" | "number";
    label?: string;
    className?: string;
}

export function StudentSkeleton({ variant = "line", label, className }: StudentSkeletonProps) {
    const { t } = useLanguage();
    return (
        <span role="status" aria-label={label ?? t.common.loading} aria-busy="true" className={cn("student-skeleton block max-w-full", className)}>
            <span aria-hidden="true" data-skeleton={variant} className={cn("student-skeleton-shape block rounded-sm bg-muted", variant === "line" ? "h-4 w-full" : variant === "block" ? "h-24 w-full" : "h-9 w-16")} />
        </span>
    );
}
