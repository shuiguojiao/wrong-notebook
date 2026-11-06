"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ImportWorkspace } from "@/components/question-entry/import-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import { usePageTitle } from "@/lib/page-title";
import type { Notebook } from "@/types/api";

export default function AddErrorPage() {
    const params = useParams();
    const router = useRouter();
    const notebookId = params.id as string;
    const { t } = useLanguage();
    const [notebook, setNotebook] = useState<Notebook | null>(null);
    usePageTitle(t.notebooks.title, notebook?.name, t.pageTitle.addError);
    useEffect(() => {
        apiClient.get<Notebook>(`/api/notebooks/${notebookId}`)
            .then(data => setNotebook(data))
            .catch(err => {
                frontendLogger.error('[AddErrorItem]', 'Failed to fetch notebook', { error: err });
                router.push("/notebooks");
            });
    }, [notebookId, router]);

    if (!notebook) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-muted-foreground">{t.common.loading}</p>
            </div>
        );
    }

    return (
        <main className="min-h-screen">
            <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-8">
                <PageHeader backHref={`/notebooks/${notebookId}`} title={t.app.addError} description={notebook.name} />
                <ImportWorkspace key={notebookId} notebookId={notebookId} notebookName={notebook.name} fixedNotebook />
            </div>
        </main>
    );
}
