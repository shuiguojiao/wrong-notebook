"use client";

import { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { ReviewHomeCard } from '@/components/review/review-home-card';
import { ReviewQuestionList } from '@/components/review/review-question-list';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { usePageTitle } from '@/lib/page-title';
import type { ReviewSessionItem } from '@/types/api';

export default function ReviewPage() {
    const { t } = useLanguage();
    usePageTitle(t.review.title);
    const [items, setItems] = useState<ReviewSessionItem[] | null>(null);
    const [completed, setCompleted] = useState(0);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let cancelled = false;
        apiClient.get<{ items: ReviewSessionItem[] }>('/api/review/due?format=overview')
            .then(data => { if (!cancelled) { setItems(data.items); setFailed(false);
                const count = Number(sessionStorage.getItem('review-completed'));
                if (Number.isSafeInteger(count) && count > 0) setCompleted(count);
                sessionStorage.removeItem('review-completed'); } })
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
        {items?.length === 0 && <EmptyState icon={CalendarCheck} title={completed > 0 ? t.review.todayComplete : t.review.empty} description={completed > 0 ? t.review.completedHint : t.review.emptyHint} />}
        {!!items?.length && <>
            <ReviewHomeCard items={items} />
            <ReviewQuestionList items={items} />
        </>}
        </div>
    </main>;
}
