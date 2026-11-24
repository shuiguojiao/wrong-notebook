"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ErrorListContent } from "@/components/error-list/error-list-content";
import { Button } from "@/components/ui/button";
import { NotebookShelf } from "@/components/student/notebook-shelf";
import { PaperCard } from "@/components/student/paper-card";
import { useLanguage } from "@/contexts/LanguageContext";
import { parseErrorListSearchParams } from "@/lib/error-list/error-list-filters";
import { usePageTitle } from "@/lib/page-title";

export default function NotebooksPage() {
    return <Suspense fallback={null}><NotebooksContents /></Suspense>;
}

function NotebooksContents() {
    const { t } = useLanguage();
    const params = useSearchParams();
    const { cause, mastery, timeRange } = parseErrorListSearchParams(params);
    usePageTitle(t.notebooks.title);
    if (cause) return <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 md:px-6">
        <ErrorListContent key={params.toString()} initialCause={cause} initialMastery={mastery} initialTimeRange={timeRange}
            renderHeader={() => <header className="mb-4 flex flex-wrap items-center gap-3">
                <Button asChild variant="outline" className="min-h-11"><Link href="/notebooks">{t.nav.notebooks}</Link></Button>
                <h1 className="text-xl font-semibold">{t.mistakeCause.distribution}</h1>
            </header>} />
    </main>;
    return <main className="mx-auto min-h-screen max-w-[1440px] px-4 py-6 md:px-6 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
        <NotebookShelf />
        <PaperCard className="hidden items-center justify-center lg:flex"><p className="text-muted-foreground">{t.student.selectNotebook}</p></PaperCard>
    </main>;
}
