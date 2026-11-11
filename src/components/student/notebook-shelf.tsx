"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { CreateNotebookDialog } from "@/components/create-notebook-dialog";
import type { CreateNotebookInput } from "@/components/create-notebook-dialog";
import { ErrorListContent } from "@/components/error-list/error-list-content";
import { NotebookSearchInput } from "@/components/error-list/notebook-search-input";
import { NotebookCard } from "@/components/notebook-card";
import { Button } from "@/components/ui/button";
import { NetworkNotice } from "@/components/student/network-notice";
import { StudentSkeleton } from "@/components/student/student-skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/error-message";
import { toast } from "@/lib/feedback";
import { locateByShortId } from "@/lib/short-id/short-id-client";
import { isShortId } from "@/lib/short-id/short-id-format";
import type { Notebook } from "@/types/api";

interface NotebookShelfProps {
    activeId?: string;
    notebooks?: Notebook[];
    onRefresh?: () => Promise<void>;
}

/** 宽屏选本栏与手机封面页共用同一套操作。 */
export function NotebookShelf({ activeId, notebooks: supplied, onRefresh }: NotebookShelfProps) {
    const { t } = useLanguage();
    const router = useRouter();
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [locating, setLocating] = useState(false);
    const [notFound, setNotFound] = useState(false);
    const fetchNotebooks = useCallback(async () => {
        setStatus("loading");
        try {
            setNotebooks(await apiClient.get<Notebook[]>("/api/notebooks"));
            setStatus("success");
        } catch { setStatus("error"); }
    }, []);
    useEffect(() => {
        if (supplied) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 进入封面页时加载数据，宽屏详情复用父页面的结果
        void fetchNotebooks();
    }, [supplied, fetchNotebooks]);
    const create = async (input: CreateNotebookInput) => {
        try {
            await apiClient.post("/api/notebooks", input);
            await (onRefresh ?? fetchNotebooks)();
        } catch (error) { toast.error(getApiErrorMessage(error) || t.notebooks.createError); }
    };
    return <section className="min-w-0 space-y-5" aria-label={t.notebooks.title}>
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold">{t.notebooks.title}</h1>
            <Button variant="outline" className="min-h-11 rounded-full" onClick={() => setDialogOpen(true)}><Plus className="size-4" aria-hidden="true" />{t.student.newNotebook}</Button>
        </div>
        <form onSubmit={async event => {
            event.preventDefault();
            if (!isShortId(search.trim()) || locating) return;
            setLocating(true);
            const id = await locateByShortId(search.trim());
            setLocating(false);
            setNotFound(!id);
            if (id) router.push(`/error-items/${id}`);
        }}>
            <div className="relative">
                <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" />
                <NotebookSearchInput value={search} onChange={event => { setSearch(event.target.value); setNotFound(false); }} aria-busy={locating} disabled={locating} className="h-12 bg-card pl-9" />
            </div>
            {notFound && <p role="alert" className="mt-1 text-sm text-destructive">{t.shortId.notFound}</p>}
        </form>
        {search.trim() && !isShortId(search.trim()) ? <ErrorListContent searchQuery={search} hideSearch /> : <>
            {!supplied && status === "loading" && <StudentSkeleton variant="block" />}
            {!supplied && status === "error" && <NetworkNotice onRetry={fetchNotebooks} />}
            <div className="space-y-4">
                {(supplied ?? notebooks).map(notebook => <NotebookCard key={notebook.id} name={notebook.name} stage={notebook.stage} subjectKey={notebook.subjectKey} errorCount={notebook._count?.errorItems ?? 0} progress={notebook.progress} active={notebook.id === activeId} onClick={() => router.push(`/notebooks/${notebook.id}`)} />)}
            </div>
        </>}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{t.student.printPrompt}</span>
            <Link href="/exams" className="student-action inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{t.student.printAction}</Link>
        </div>
        <CreateNotebookDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreate={create} />
    </section>;
}
