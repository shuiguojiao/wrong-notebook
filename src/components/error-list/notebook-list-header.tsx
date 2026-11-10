"use client";

import Link from "next/link";
import { GitCompareArrows, ListChecks, Pencil, Plus, Printer, Sparkles, Trash2 } from "lucide-react";
import { RetagNotebookButton } from "@/components/retag-notebook-button";
import { Button } from "@/components/ui/button";
import { MoreMenu } from "@/components/ui/more-menu";
import { PageHeader } from "@/components/ui/page-header";
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
    return <>
        <RetagNotebookButton notebookId={notebook.id} onFinished={onRetagFinished} renderAction={({ start, message }) => <>
            <PageHeader backHref="/notebooks" title={<span className="student-notebook-title inline-block rounded-md bg-secondary px-3 py-1 text-secondary-foreground" data-subject={notebook.subjectKey}>{notebook.name}</span>}
                description={t.student.notebookSummary.replace("{mastered}", mastered).replace("{count}", String(controls.total ?? notebook._count?.errorItems ?? 0)).replace("{pending}", controls.pending === null ? "…" : String(controls.pending))}
                actions={<>
                    <Button asChild className="min-h-11"><Link href={`/notebooks/${notebook.id}/add`}><Plus className="size-4" aria-hidden="true" />{t.common.add}</Link></Button>
                    <MoreMenu items={[
                        { label: t.notebook.exportPrint, icon: Printer, onClick: controls.exportPrint },
                        { label: controls.selecting ? t.notebook.cancelSelect : t.notebook.selectMode, icon: ListChecks, onClick: controls.toggleSelect },
                        { label: t.questionSimilarity.title, icon: GitCompareArrows, onClick: () => { if (!controls.selecting) controls.toggleSelect(); } },
                        { label: t.retag.notebookButton, icon: Sparkles, onClick: start },
                        { label: t.notebooks.rename, icon: Pencil, onClick: onRename },
                        { label: t.common.delete, icon: Trash2, onClick: onDelete, destructive: true, separatorBefore: true },
                    ]} />
                </>}
            />
            <div className="mt-3 flex justify-end">
                {due !== undefined && due > 0 ? <Button asChild className="min-h-11 whitespace-normal text-center"><Link href={`/review/session?subjectId=${encodeURIComponent(notebook.id)}&autostart=1`}>{t.student.reviewNotebook.replace("{count}", String(due))}</Link></Button>
                    : <Button disabled className="min-h-11 whitespace-normal text-center">{due === undefined ? t.common.loading : t.student.noNotebookReview}</Button>}
            </div>
            {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
        </>} />
    </>;
}
