"use client";

import { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { ReviewCompletedCard } from '@/components/review/review-completed-card';
import { ReviewHomeCard } from '@/components/review/review-home-card';
import { ReviewQuestionList } from '@/components/review/review-question-list';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { usePageTitle } from '@/lib/page-title';
import type { ReviewQueueResponse } from '@/types/api';

export default function ReviewPage() {
    const { t } = useLanguage();
    usePageTitle(t.review.title);
    const [data, setData] = useState<ReviewQueueResponse | null>(null);
    const items = data?.items;
    const [backlogHint, setBacklogHint] = useState(false);
    const [completed, setCompleted] = useState(0);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let cancelled = false;
        apiClient.get<ReviewQueueResponse>('/api/review/due?format=overview')
            .then(data => {
                if (cancelled) return;
                setData(data);
                setFailed(false);
                const hintKey = `review-backlog:${data.dayKey}`;
                if (data.backlogHint && !sessionStorage.getItem(hintKey)) {
                    setBacklogHint(true);
                    sessionStorage.setItem(hintKey, '1');
                }
                const count = Number(sessionStorage.getItem('review-completed'));
                if (Number.isSafeInteger(count) && count > 0) setCompleted(count);
                sessionStorage.removeItem('review-completed');
            })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [retry]);
    return <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <div className="w-full max-w-2xl space-y-6">
            <h1 className="text-2xl font-bold">{t.review.title}</h1>
            {completed > 0 && <p role="status" className="text-sm text-muted-foreground">{t.review.progressKept.replace('{count}', String(completed))}</p>}
            {failed && <p role="alert" className="text-destructive">{t.review.loadFailed}
                <Button variant="link" onClick={() => { setFailed(false); setRetry(value => value + 1); }}>{t.review.retry}</Button>
            </p>}
            {!items && !failed && <p role="status">{t.common.loading}</p>}
            {backlogHint && <p role="status" className="text-sm text-muted-foreground">{t.review.backlogHint}</p>}
            {items?.length === 0 && ((data?.todayReviewed ?? 0) > 0
                ? <ReviewCompletedCard durationSec={data?.todayDurationSec ?? 0} />
                : <EmptyState icon={CalendarCheck} title={t.review.empty} description={t.review.emptyHint} />)}
            {!!items?.length && <ReviewHomeCard items={items} />}
            {data && (items?.length
                ? <ReviewQuestionList items={items} tomorrowMinutes={data.tomorrowMinutes} />
                : <p className="text-sm text-muted-foreground">{t.review.tomorrowMinutes.replace('{minutes}', String(Math.ceil(data.tomorrowMinutes)))}</p>)}
        </div>
    </main>;
}
