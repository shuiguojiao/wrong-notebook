"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export type ProgressStampProps = { className?: string } & (
    | { variant: "streak"; days: number }
    | { variant: "correct" | "almost" }
    | { variant: "done"; date: string }
);

export function ProgressStamp(props: ProgressStampProps) {
    const { t } = useLanguage();
    const days = props.variant === "streak" && Number.isFinite(props.days) ? Math.max(0, Math.trunc(props.days)) : 0;
    const label = props.variant === "streak" ? t.student.streakDays.replace("{count}", String(days))
        : props.variant === "done" ? `${props.date} · ${t.review.doneStamp}`
        : props.variant === "correct" ? t.review.correct : t.student.almost;
    return (
        <span role="img" aria-label={label} data-stamp={props.variant} className={cn("student-stamp relative inline-grid place-items-center rounded-md border bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground", props.className)}>
            <span className="student-stamp-decoration" aria-hidden="true" />
            <span className="relative" aria-hidden="true">{props.variant === "done" ? <><span className="block text-xs">{props.date}</span><span className="block text-2xl font-bold">{t.review.doneStamp}</span></> : props.variant === "correct" ? "✓" : label}</span>
        </span>
    );
}
