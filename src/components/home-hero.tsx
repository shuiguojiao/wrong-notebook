"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Highlighter } from "@/components/student/highlighter";
import { StudentSkeleton } from "@/components/student/student-skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import type { ReviewQueueResponse } from "@/types/api";

interface HomeHeroProps {
    data?: ReviewQueueResponse;
    loading?: boolean;
    streak?: ReactNode;
    balance?: ReactNode;
    week?: ReactNode;
}

/** 日期遵循应用时区，加载时不把未知题量当作零。 */
export function HomeHero({ data, loading = true, streak, balance, week }: HomeHeroProps) {
    const { t, language } = useLanguage();
    const { timeZone } = useTimeZone();
    const { data: session } = useSession();
    const [now, setNow] = useState<Date>();
    useEffect(() => {
        const update = () => setNow(new Date());
        update();
        const timer = setInterval(update, 60_000);
        return () => clearInterval(timer);
    }, []);
    const name = session?.user?.name || t.student.you;
    const [before, after] = t.student.todayGreeting.replace("{name}", name).split("{minutes}");
    return <header className="student-home-hero flex items-start justify-between gap-3 py-2 sm:gap-6">
        <div className="min-w-0 flex-1 space-y-3">
            {now ? <p className="text-sm text-muted-foreground"><time dateTime={now.toISOString()}>{new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", { timeZone, month: "long", day: "numeric", weekday: "short" }).format(now)}</time></p> : <StudentSkeleton className="w-36" />}
            <div className="flex flex-col items-start gap-x-4 sm:flex-row sm:items-center">
                {data ? <h1 className="text-balance font-title text-3xl leading-snug sm:text-4xl">
                    {data.items.length ? <>{before}<Highlighter>{Math.ceil(data.estimatedMinutes)}{t.student.minuteUnit}</Highlighter>{after}</> : t.student.noReviewToday}
                </h1> : loading ? <StudentSkeleton variant="block" className="max-w-md" /> : <h1 className="text-3xl">{t.nav.home}</h1>}
                {balance}
            </div>
            {week}
        </div>
        {streak}
    </header>;
}
