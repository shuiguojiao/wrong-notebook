"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { CalendarCheck } from "lucide-react";
import { HomeHero } from "@/components/home-hero";
import { ReviewCompletedCard } from "@/components/review/review-completed-card";
import { ReviewHomeCard } from "@/components/review/review-home-card";
import { ReviewQuestionList } from "@/components/review/review-question-list";
import { NetworkNotice } from "@/components/student/network-notice";
import { StudentSkeleton } from "@/components/student/student-skeleton";
import { TodayEntry } from "@/components/student/today-entry";
import { TodayTaskStatus } from "@/components/student/today-task-status";
import { EmptyState } from "@/components/ui/empty-state";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTodayReview } from "@/lib/hooks/use-today-review";

interface TodayDashboardProps {
    notebookId?: string;
    photoEntry?: boolean;
    showEntry?: boolean;
}

const mediaQuery = "(min-width: 768px)";
const subscribeWidth = (callback: () => void) => {
    const media = window.matchMedia(mediaQuery);
    media.addEventListener("change", callback);
    return () => media.removeEventListener("change", callback);
};
const wideSnapshot = () => window.matchMedia(mediaQuery).matches;
const serverSnapshot = () => false;

/** 首页和概览共用今日任务与同一份轻量队列。 */
export function TodayDashboard({ notebookId, photoEntry = false, showEntry = true }: TodayDashboardProps) {
    const { t } = useLanguage();
    const { status, data, notebooks, backlogHint, completed, retry } = useTodayReview();
    const [openOverride, setQuestionsOpen] = useState<boolean>();
    const wide = useSyncExternalStore(subscribeWidth, wideSnapshot, serverSnapshot);
    const questionsOpen = openOverride ?? wide;
    const questionsRef = useRef<HTMLDivElement>(null);
    const target = notebooks.find(notebook => notebook.id === notebookId);
    return <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8">
        <div className="space-y-6 lg:col-start-1 lg:row-span-3 lg:row-start-1">
            <HomeHero data={data} loading={status === "loading"} />
            {status === "loading" && <StudentSkeleton variant="block" className="h-60" />}
            {status === "error" && <NetworkNotice onRetry={retry} />}
            {completed > 0 && <p role="status" className="text-sm text-muted-foreground">{t.review.progressKept.replace("{count}", String(completed))}</p>}
            {backlogHint && <p role="status" className="text-sm text-muted-foreground">{t.review.backlogHint}</p>}
            {data && <>
                {(data.items.length > 0 || !!data.reviewedSubjects?.length) && <ReviewHomeCard items={data.items} reviewedSubjects={data.reviewedSubjects} questionsOpen={questionsOpen} onViewQuestions={() => {
                    setQuestionsOpen(!questionsOpen);
                    questionsRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
                }} />}
                {!data.items.length && (data.todayReviewed > 0 ? <ReviewCompletedCard answeredCount={data.todayReviewed} dayKey={data.dayKey} durationSec={data.todayDurationSec} /> : <EmptyState variant="student" icon={CalendarCheck} title={t.review.empty} description={t.review.emptyHint} />)}
                <p className="text-sm text-muted-foreground">{t.review.tomorrowMinutes.replace("{minutes}", String(Math.ceil(data.tomorrowMinutes)))}</p>
            </>}
        </div>
        <div className="empty:hidden lg:col-start-2 lg:row-start-2"><TodayTaskStatus /></div>
        <div ref={questionsRef} className="empty:hidden lg:col-start-2 lg:row-start-1">
            {data && data.items.length > 0 && <ReviewQuestionList items={data.items} open={questionsOpen} onOpenChange={setQuestionsOpen} previewLimit={6} />}
        </div>
        {showEntry && <div className="empty:hidden lg:col-start-2 lg:row-start-3"><TodayEntry key={notebookId || "home"} notebookId={notebookId} notebookName={target?.name} photoEntry={photoEntry} /></div>}
    </div>;
}
