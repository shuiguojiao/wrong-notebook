"use client";

import { useState, Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CheckEntry } from "@/components/checks/check-entry";
import { HomeHero } from "@/components/home-hero";
import { ImportWorkspace } from "@/components/question-entry/import-workspace";
import { PageLoading } from "@/components/ui/page-loading";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import { usePageTitle } from "@/lib/page-title";
import type { Notebook, PaginatedResponse } from "@/types/api";

function HomeContent() {
    const { t } = useLanguage();
    usePageTitle(t.pageTitle.home);
    const searchParams = useSearchParams();
    const initialNotebookId = searchParams.get("notebook");
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [dueCount, setDueCount] = useState<number | null>(null);
    const targetNotebook = notebooks.find(n => n.id === initialNotebookId);

    useEffect(() => {
        // Fetch notebooks for auto-selection
        apiClient.get<Notebook[]>("/api/notebooks")
            .then(data => setNotebooks(data))
            .catch(err => frontendLogger.error('[Home]', 'Failed to fetch notebooks', { error: err }));
        apiClient.get<PaginatedResponse<unknown>>("/api/review/due?pageSize=1")
            .then(data => setDueCount(data.total))
            .catch(err => frontendLogger.error('[Home]', 'Failed to fetch due reviews', { error: err }));
    }, []);

    const totalItems = notebooks.reduce((sum, n) => sum + (n._count?.errorItems || 0), 0);
    return (
        <main className="min-h-screen">
            <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-8">
                <HomeHero notebookCount={notebooks.length} itemCount={totalItems} dueCount={dueCount} targetNotebook={targetNotebook?.name} />
                <CheckEntry />
                <ImportWorkspace key={initialNotebookId || "home"} notebookId={initialNotebookId || undefined} notebookName={targetNotebook?.name} />
            </div>
        </main>
    );
}

export default function Home() {
    return (
        <Suspense fallback={<PageLoading />}>
            <HomeContent />
        </Suspense>
    );
}
