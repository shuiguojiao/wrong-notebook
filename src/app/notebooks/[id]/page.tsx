"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ErrorListContent } from "@/components/error-list/error-list-content";
import { NotebookListHeader } from "@/components/error-list/notebook-list-header";
import { PageLoading } from "@/components/ui/page-loading";
import { NotebookShelf } from "@/components/student/notebook-shelf";
import { RenameNotebookDialog } from "@/components/rename-notebook-dialog";
import { parseErrorListSearchParams } from "@/lib/error-list/error-list-filters";
import { apiClient } from "@/lib/api-client";

import { useLanguage } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/lib/page-title";
import { confirmDialog, toast } from "@/lib/feedback";
import { getApiErrorMessage } from "@/lib/error-message";
import { frontendLogger } from "@/lib/frontend-logger";
import type { Notebook } from "@/types/api";

export default function NotebookDetailPage() {
    return <Suspense fallback={null}><NotebookDetailContent /></Suspense>;
}

function NotebookDetailContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const initialFilters = parseErrorListSearchParams(searchParams);
    const router = useRouter();
    const { t } = useLanguage();
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [notebook, setNotebook] = useState<Notebook | null>(null);
    usePageTitle(t.notebooks.title, notebook?.name);
    const [loading, setLoading] = useState(true);
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    // 批量重新生成知识点后递增，用于刷新题目列表
    const [listVersion, setListVersion] = useState(0);

    const fetchNotebook = useCallback(async (id: string, showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const data = await apiClient.get<Notebook[]>("/api/notebooks");
            const found = data.find(item => item.id === id);
            if (!found) { router.replace("/notebooks"); return; }
            setNotebooks(data);
            setNotebook(found);
        } catch (error) {
            frontendLogger.error('[NotebookDetail]', 'Failed to fetch notebook', { error });
            toast.error(t.notebooks?.notFound || "Notebook not found");
            router.push("/notebooks");
        } finally {
            setLoading(false);
        }
    }, [router, t]);

    useEffect(() => {
        if (params.id) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- 数据请求：进入页面或条件变化时加载，请求前后更新加载状态和结果
            fetchNotebook(params.id as string);
        }
    }, [params.id, fetchNotebook]);

    const handleRename = async (name: string) => {
        if (!notebook) return;
        const updated = await apiClient.put<Notebook>(`/api/notebooks/${notebook.id}`, { name });
        setNotebook(current => ({ ...updated, progress: current?.progress }));
        setNotebooks(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item));
    };

    const handleDelete = async () => {
        if (!notebook) return;
        try {
            // 列表中可能刚删过题目，先取最新题目数再判断
            const latest = await apiClient.get<Notebook>(`/api/notebooks/${notebook.id}`);
            if ((latest._count?.errorItems || 0) > 0) {
                toast.warning(t.notebooks?.deleteNotEmpty || "Please clear all items in this notebook first.");
                return;
            }
            if (!(await confirmDialog((t.notebooks?.deleteConfirm || "Are you sure?").replace("{name}", notebook.name), { destructive: true }))) return;
            await apiClient.delete(`/api/notebooks/${notebook.id}`);
            router.replace("/notebooks");
        } catch (error) {
            frontendLogger.error('[NotebookDetail]', 'Failed to delete notebook', { error });
            toast.error(getApiErrorMessage(error) || t.notebooks?.deleteError || "Failed to delete");
        }
    };

    if (loading) {
        return <PageLoading label={t.common.loading} />;
    }

    if (!notebook) return null;

    return (
        <main className="mx-auto min-h-screen max-w-[1440px] px-4 py-4 md:px-6 md:py-6 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
            <aside className="hidden lg:block"><NotebookShelf activeId={notebook.id} notebooks={notebooks} onRefresh={() => fetchNotebook(notebook.id)} /></aside>
            <div className="min-w-0">
                <ErrorListContent
                    key={`${notebook.id}-${listVersion}`}
                    onItemsChanged={() => fetchNotebook(notebook.id, false)}
                    subjectId={notebook.id}
                    subjectName={notebook.name}
                    tagSet={notebook.tagSet || 'default'}
                    initialMastery={initialFilters.mastery}
                    initialTag={initialFilters.tag} initialTagSet={initialFilters.tagSet}
                    renderHeader={controls => <NotebookListHeader notebook={notebook} controls={controls} onRename={() => setRenameDialogOpen(true)} onDelete={handleDelete} onRetagFinished={() => setListVersion(value => value + 1)} />}
                />

                <RenameNotebookDialog
                    open={renameDialogOpen}
                    onOpenChange={setRenameDialogOpen}
                    currentName={notebook.name}
                    onRename={handleRename}
                />
            </div>
        </main>
    );
}
