"use client";

import Link from "next/link";
import { GitCompareArrows, ListChecks, Pencil, Plus, Printer, Sparkles, Trash2 } from "lucide-react";
import { RetagNotebookButton } from "@/components/retag-notebook-button";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { MoreMenu } from "@/components/ui/more-menu";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ErrorListHeaderControls } from "@/components/error-list/error-list-content";
import type { Notebook } from "@/types/api";

interface NotebookListHeaderProps {
    notebook: Notebook;
    controls: ErrorListHeaderControls;
    onRename: () => void;
    onDelete: () => void;
    onRetagFinished: () => void;
}

export function NotebookListHeader({ notebook, controls, onRename, onDelete, onRetagFinished }: NotebookListHeaderProps) {
    const { t } = useLanguage();
    const mastered = controls.total === null || controls.pending === null ? "…" : String(controls.total - controls.pending);
    const due = controls.dueToday ?? notebook.progress?.dueToday;
    const summary = t.student.notebookSummary.replace("{mastered}", mastered).replace("{count}", String(controls.total ?? notebook._count?.errorItems ?? 0)).replace("{pending}", controls.pending === null ? "…" : String(controls.pending));
    return <>
        <RetagNotebookButton notebookId={notebook.id} onFinished={onRetagFinished} renderAction={({ start, message }) => <>
            <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="flex min-w-0 items-center gap-3">
                    <BackButton fallbackUrl="/notebooks" className="-ml-2 shrink-0" />
                    <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight sm:text-3xl"><span className="student-notebook-title inline-block max-w-full truncate rounded-md bg-secondary px-3 py-1 align-bottom text-secondary-foreground" data-subject={notebook.subjectKey}>{notebook.name}</span></h1>
                </div>
                {/* 各段是 flex 子项，首尾空白会被折叠，分隔符用 whitespace-pre 保留空格 */}
                <p className="col-span-2 row-start-2 flex flex-wrap items-center text-sm text-muted-foreground sm:col-span-3 sm:text-base">
                    {summary.split(" · ").map((part, index) => <span key={index} className="whitespace-nowrap">{index > 0 && <span className="whitespace-pre">{" · "}</span>}{part}</span>)}
                </p>
                {due !== undefined && due > 0 && <Button asChild className="col-span-2 row-start-3 min-h-11 whitespace-normal text-center sm:col-span-1 sm:col-start-2 sm:row-start-1"><Link href={`/review/session?subjectId=${encodeURIComponent(notebook.id)}&autostart=1`}>{t.student.reviewNotebook.replace("{count}", String(due))}</Link></Button>}
                <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-2 sm:col-start-3">
                    <Button asChild className="min-h-11"><Link href={`/notebooks/${notebook.id}/add`}><Plus className="size-4" aria-hidden="true" />{t.common.add}</Link></Button>
                    <MoreMenu items={[
                        { label: t.notebook.exportPrint, icon: Printer, onClick: controls.exportPrint },
                        { label: controls.selecting ? t.notebook.cancelSelect : t.notebook.selectMode, icon: ListChecks, onClick: controls.toggleSelect },
                        { label: t.questionSimilarity.title, icon: GitCompareArrows, onClick: () => { if (!controls.selecting) controls.toggleSelect(); } },
                        { label: t.retag.notebookButton, icon: Sparkles, onClick: start },
                        { label: t.notebooks.rename, icon: Pencil, onClick: onRename },
                        { label: t.common.delete, icon: Trash2, onClick: onDelete, destructive: true, separatorBefore: true },
                    ]} />
                </div>
            </header>
            {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
        </>} />
    </>;
}
