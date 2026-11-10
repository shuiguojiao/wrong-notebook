"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckEntry } from "@/components/checks/check-entry";
import { HomeHero } from "@/components/home-hero";
import { ImportWorkspace } from "@/components/question-entry/import-workspace";
import { TodayTaskStatus } from "@/components/student/today-task-status";
import { PageLoading } from "@/components/ui/page-loading";
import { useLanguage } from "@/contexts/LanguageContext";
import { useHomeStats } from "@/lib/hooks/use-home-stats";
import { usePageTitle } from "@/lib/page-title";

function HomeContent() {
    const { t } = useLanguage();
    usePageTitle(t.pageTitle.home);
    const searchParams = useSearchParams();
    const initialNotebookId = searchParams.get("notebook");
    const { notebooks, items, due } = useHomeStats();
    const targetNotebook = notebooks.status === "success"
        ? notebooks.data.find(notebook => notebook.id === initialNotebookId)
        : undefined;

    return (
        <main className="min-h-screen">
            <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
                <div className="grid items-start gap-6 lg:grid-cols-2">
                    <HomeHero notebookCount={notebooks} itemCount={items} dueCount={due} targetNotebook={targetNotebook?.name} />
                    <div className="space-y-4"><TodayTaskStatus /><CheckEntry /></div>
                </div>
                <ImportWorkspace photoEntry={searchParams.get("entry") === "photo"} key={initialNotebookId || "home"} notebookId={initialNotebookId || undefined} notebookName={targetNotebook?.name} />
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
