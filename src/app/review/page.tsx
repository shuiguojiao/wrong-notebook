"use client";

import Link from "next/link";
import { TodayDashboard } from "@/components/student/today-dashboard";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/lib/page-title";

export default function ReviewPage() {
    const { t } = useLanguage();
    usePageTitle(t.review.title);
    return <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 md:px-8 md:py-8">
        <Button asChild variant="link" className="min-h-11 px-0"><Link href="/">{t.student.backToToday}</Link></Button>
        <TodayDashboard showEntry={false} />
    </main>;
}
