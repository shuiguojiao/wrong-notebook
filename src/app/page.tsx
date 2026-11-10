"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { StudentSkeleton } from "@/components/student/student-skeleton";
import { TodayDashboard } from "@/components/student/today-dashboard";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/lib/page-title";

function HomeContent() {
    const { t } = useLanguage();
    usePageTitle(t.pageTitle.home);
    const searchParams = useSearchParams();
    return <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <TodayDashboard notebookId={searchParams.get("notebook") || undefined} photoEntry={searchParams.get("entry") === "photo"} />
    </main>;
}

export default function Home() {
    return <Suspense fallback={<StudentSkeleton variant="block" />}><HomeContent /></Suspense>;
}
