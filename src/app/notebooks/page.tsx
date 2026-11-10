"use client";

import { NotebookShelf } from "@/components/student/notebook-shelf";
import { PaperCard } from "@/components/student/paper-card";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/lib/page-title";

export default function NotebooksPage() {
    const { t } = useLanguage();
    usePageTitle(t.notebooks.title);
    return <main className="mx-auto min-h-screen max-w-[1440px] px-4 py-6 md:px-6 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
        <NotebookShelf />
        <PaperCard className="hidden items-center justify-center lg:flex"><p className="text-muted-foreground">{t.student.selectNotebook}</p></PaperCard>
    </main>;
}
