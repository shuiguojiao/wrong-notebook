"use client";

import { ImportWorkspace } from "@/components/question-entry/import-workspace";
import { useLanguage } from "@/contexts/LanguageContext";

interface TodayEntryProps {
    notebookId?: string;
    notebookName?: string;
    photoEntry?: boolean;
}

/** 共用一排来源入口，工作区始终保留草稿、上传队列与确认流程。 */
export function TodayEntry({ notebookId, notebookName, photoEntry = false }: TodayEntryProps) {
    const { t } = useLanguage();
    return <section className="space-y-3" aria-label={t.student.newQuestion}>
        <h2 className="text-base">{t.student.newQuestion}</h2>
        {notebookName && <p className="text-sm text-muted-foreground">{t.home.targetNotebook.replace("{name}", notebookName)}</p>}
        <ImportWorkspace notebookId={notebookId} notebookName={notebookName} photoEntry={photoEntry} />
    </section>;
}
