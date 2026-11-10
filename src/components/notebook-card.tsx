"use client";

import { Atom, BookOpen, BookText, ChevronRight, FlaskConical, Globe, Landmark, Languages, Leaf, Scale, Sigma } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Highlighter } from "@/components/student/highlighter";
import { NotebookScopeLabel } from "@/components/notebook-scope-label";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { resolveNotebookScope } from "@/lib/notebook-scope";
import type { NotebookSubject } from "@/lib/notebook-scope";

interface NotebookCardProps {
    name: string;
    stage?: string | null;
    subjectKey?: string | null;
    errorCount: number;
    onClick: () => void;
    itemLabel?: string;
    progress?: { mastered: number; unmastered: number; dueToday: number };
    active?: boolean;
}

/** 各学科的图标与配色，便于在列表中一眼区分 */
const SUBJECT_STYLE: Record<NotebookSubject, { icon: LucideIcon; className: string }> = {
    math: { icon: Sigma, className: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300" },
    english: { icon: Languages, className: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
    chinese: { icon: BookText, className: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" },
    physics: { icon: Atom, className: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100" },
    chemistry: { icon: FlaskConical, className: "bg-teal-100 text-teal-950 dark:bg-teal-950 dark:text-teal-100" },
    biology: { icon: Leaf, className: "bg-lime-100 text-lime-950 dark:bg-lime-950 dark:text-lime-100" },
    history: { icon: Landmark, className: "bg-orange-100 text-orange-950 dark:bg-orange-950 dark:text-orange-100" },
    geography: { icon: Globe, className: "bg-cyan-100 text-cyan-950 dark:bg-cyan-950 dark:text-cyan-100" },
    politics: { icon: Scale, className: "bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100" },
};

const DEFAULT_STYLE = { icon: BookOpen, className: "bg-accent text-accent-foreground" };

export function NotebookCard({ name, stage, subjectKey, errorCount, onClick, itemLabel, progress, active = false }: NotebookCardProps) {
    const { t } = useLanguage();
    const scope = resolveNotebookScope({ name, stage, subjectKey });
    const { icon: Icon, className: iconClass } = scope.subject ? SUBJECT_STYLE[scope.subject] : DEFAULT_STYLE;

    return (
        <button type="button" aria-current={active ? "page" : undefined}
            className={cn("student-notebook-cover group relative w-full overflow-hidden rounded-xl border bg-card p-4 pl-7 text-left shadow-sm transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "ring-2 ring-foreground ring-offset-4", iconClass)}
            data-subject={scope.subject ?? "other"} onClick={onClick}>
            <span aria-hidden="true" className="student-book-spine absolute inset-y-0 left-0 w-3 bg-current opacity-40" />
            <span className="flex items-center justify-between gap-2">
                <span className="student-book-name inline-flex min-w-0 items-center gap-2 rounded-sm bg-card px-2 py-1 text-card-foreground">
                    <Icon className="size-4 shrink-0" aria-hidden="true" /><span className="truncate text-lg font-bold">{name}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold">{errorCount} {itemLabel ?? t.notebooks.cardItems}</span>
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
            </span>
            <span className="sr-only"><NotebookScopeLabel notebook={{ name, stage, subjectKey }} /></span>
            <span role="progressbar" aria-label={t.student.mastered} aria-valuemin={0} aria-valuemax={errorCount || 1} aria-valuenow={progress?.mastered} className="mt-3 block h-2 overflow-hidden rounded-full bg-foreground/15">
                <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${errorCount && progress ? progress.mastered / errorCount * 100 : 0}%` }} />
            </span>
            <span className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>{t.student.notebookProgress.replace("{mastered}", String(progress?.mastered ?? "…")).replace("{pending}", String(progress?.unmastered ?? "…"))}</span>
                <Highlighter className="rounded-full px-2 py-1 font-semibold">{t.student.dueTodayCount.replace("{count}", String(progress?.dueToday ?? "…"))}</Highlighter>
            </span>
        </button>
    );
}
