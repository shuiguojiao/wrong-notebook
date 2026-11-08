"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReviewLimitSelect } from '@/components/review/review-limit-select';
import { ReviewQuestion } from '@/components/review/review-question';
import { ReviewSubjectFilter } from '@/components/review/review-subject-filter';
import { ReviewSummary } from '@/components/review/review-summary';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReviewSession } from '@/lib/hooks/use-review-session';
import { usePageTitle } from '@/lib/page-title';
import { parseReviewLimit } from '@/lib/review-session';

interface ReviewSessionProps { initialSubjectId: string; initialLimit: string | null; autostart?: boolean }

export function ReviewSession({ initialSubjectId, initialLimit, autostart = false }: ReviewSessionProps) {
    const { t } = useLanguage();
    usePageTitle(t.review.sessionTitle);
    const [subjectId, setSubjectId] = useState(initialSubjectId);
    const [limit, setLimit] = useState(parseReviewLimit(initialLimit));
    const session = useReviewSession();
    const router = useRouter();
    const [automatic] = useState(autostart);
    const started = useRef(false);
    useEffect(() => {
        if (!automatic || started.current) return;
        started.current = true;
        const query = new URLSearchParams(window.location.search);
        query.delete('autostart');
        router.replace(`/review/session${query.size ? `?${query}` : ''}`, { scroll: false });
        void session.start(subjectId, limit);
    }, [automatic, router, session, subjectId, limit]);
    if (session.items && session.items.length > 0 && !session.current) {
        return <ReviewSummary items={session.items} outcomes={session.outcomes} />;
    }
    return <div className="space-y-6">
        <header className="space-y-4">
            <Link href="/review" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">{t.review.backToList}</Link>
            <h1 className="text-2xl font-bold">{t.review.sessionTitle}</h1>
        </header>
        {!session.items && (!automatic || session.error) && <div className="space-y-6 rounded-xl border p-4 sm:p-6">
            <p className="text-muted-foreground">{t.review.sessionHint}</p>
            <ReviewSubjectFilter value={subjectId} onChange={setSubjectId} />
            <ReviewLimitSelect value={limit} onChange={setLimit} disabled={session.loading} />
            {session.error && <p role="alert" className="text-destructive">{session.error}</p>}
            <Button className="min-h-11 w-full sm:w-auto" disabled={session.loading} onClick={() => session.start(subjectId, limit)}>
                {session.loading ? t.common.loading : t.review.start}
            </Button>
        </div>}
        {automatic && !session.items && !session.error && <p role="status">{t.common.loading}</p>}
        {session.items?.length === 0 && <p>{t.review.empty}</p>}
        {session.current && <>
            <div className="space-y-2">
                <p aria-live="polite">{t.review.progress.replace('{current}', String(session.completed + 1)).replace('{total}', String(session.total))}</p>
                <Progress value={session.percent} aria-label={t.review.sessionTitle} className="h-2 [&>div]:motion-reduce:transition-none" />
            </div>
            <ReviewQuestion key={session.current.id} item={session.current} last={session.completed + 1 === session.total} onComplete={session.complete} />
        </>}
    </div>;
}
