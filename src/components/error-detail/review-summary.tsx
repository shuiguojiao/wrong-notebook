"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { MasteryPanel } from "@/components/mastery-panel";
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import { apiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/date-time";
import { ReviewSchedulePanel } from "./review-schedule-panel";
import type { ReviewScheduleResponse } from "./review-schedule-panel";
import type { MasteryStatus } from "@/lib/mastery-status";
import type { PracticeHistoryResponse } from "@/types/api";

interface ReviewSummaryProps { id: string; revision: string }

/** 摘要独立加载，展开后沿用原有复习调整与练习记录的完整交互。 */
export function ReviewSummary({ id, revision }: ReviewSummaryProps) {
    const { t } = useLanguage();
    const { timeZone } = useTimeZone();
    const [state, setState] = useState<ReviewScheduleResponse | null>(null);
    const [failed, setFailed] = useState(false);
    const [status, setStatus] = useState<MasteryStatus | null>(null);
    const readVersion = useRef(0);
    const updateSchedule = (value: ReviewScheduleResponse) => { readVersion.current++; setState(value); setFailed(false); };
    const [recordsRevision, setRecordsRevision] = useState(0);
    const refreshRecords = useCallback(() => setRecordsRevision(value => value + 1), []);
    useEffect(() => {
        let cancelled = false;
        const version = ++readVersion.current;
        apiClient.get<ReviewScheduleResponse>(`/api/error-items/${encodeURIComponent(id)}/review`)
            .then(value => { if (!cancelled && version === readVersion.current) { setState(value); setFailed(false); } })
            .catch(() => { if (!cancelled && version === readVersion.current) setFailed(true); });
        apiClient.get<PracticeHistoryResponse>(`/api/error-items/${id}/practice-records`)
            .then(value => { if (!cancelled) setStatus(value.masteryStatus); })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, [id, revision, recordsRevision]);
    const round = state?.completedAt ? t.review.scheduleComplete : state ? t.review.round.replace('{round}', String(state.stage + 1)).replace('{total}', String(state.totalRounds)) : failed ? t.review.scheduleFailed : t.common.loading;
    return <Dialog>
        <DialogTrigger asChild>
            <button type="button" className="flex min-h-14 w-full items-center justify-between gap-2 rounded-xl border bg-card p-4 text-left text-sm shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex flex-wrap gap-x-1.5 gap-y-1">
                    <span>{t.detail.reviewLabel}</span><span aria-hidden="true">·</span><span>{round}</span>
                    {state?.nextReviewAt && <span>· {t.review.nextReview} {formatDateTime(state.nextReviewAt, 'MM-dd', timeZone)}</span>}
                    {status && <span>· {(status === "mastered" ? t.notebook.mastered : status === "reviewing" ? t.notebook.reviewing : t.notebook.review)}</span>}
                </span>
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
            </button>
        </DialogTrigger>
        <DialogPortal>
            <DialogOverlay />
            <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-xl border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 lg:inset-x-auto lg:left-1/2 lg:top-1/2 lg:bottom-auto lg:w-[min(40rem,calc(100%-2rem))] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl">
                <DialogTitle className="mb-4 pr-10 text-lg font-semibold">{t.detail.reviewSummary}</DialogTitle>
                <DialogClose aria-label={t.common.close} className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><X className="size-5" aria-hidden="true" /></DialogClose>
                <div className="space-y-4">
                    <ReviewSchedulePanel id={id} revision={`${revision}:${recordsRevision}`} onChange={updateSchedule} />
                    <MasteryPanel errorItemId={id} onRecordsChange={refreshRecords} onMasteryStatusChange={setStatus} />
                </div>
            </DialogPrimitive.Content>
        </DialogPortal>
    </Dialog>;
}
