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
    return <>
        <RetagNotebookButton notebookId={notebook.id} onFinished={onRetagFinished} renderAction={({ start, message }) => <>
            <PageHeader backHref="/notebooks" title={notebook.name}
                description={t.student.notebookSummary.replace("{count}", String(controls.total ?? notebook._count?.errorItems ?? 0)).replace("{pending}", controls.pending === null ? "…" : String(controls.pending))}
                actions={<>
                    <Button asChild className="hidden sm:inline-flex"><Link href={`/notebooks/${notebook.id}/add`}><Plus className="size-4" aria-hidden="true" />{t.common.add}</Link></Button>
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
            {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
        </>} />
        {!controls.selecting && <Button asChild size="icon" className="fixed bottom-[calc(8.5rem+env(safe-area-inset-bottom))] right-4 z-40 size-14 rounded-full shadow-lg sm:hidden">
            <Link href={`/notebooks/${notebook.id}/add`} aria-label={t.notebooks.addError}><Plus className="size-6" aria-hidden="true" /></Link>
        </Button>}
    </>;
}
