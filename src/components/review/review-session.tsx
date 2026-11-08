"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ReviewQuestion } from '@/components/review/review-question';
import { ReviewSubjectFilter } from '@/components/review/review-subject-filter';
import { ReviewSummary } from '@/components/review/review-summary';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReviewSession } from '@/lib/hooks/use-review-session';
import { usePageTitle } from '@/lib/page-title';
import { parseReviewLimit } from '@/lib/review-session';

interface ReviewSessionProps { initialSubjectId: string; initialLimit: string | null }

export function ReviewSession({ initialSubjectId, initialLimit }: ReviewSessionProps) {
    const { t } = useLanguage();
    usePageTitle(t.review.sessionTitle);
    const [subjectId, setSubjectId] = useState(initialSubjectId);
    const [limit, setLimit] = useState(parseReviewLimit(initialLimit));
    const session = useReviewSession();
    if (session.items && session.items.length > 0 && !session.current) {
        return <ReviewSummary items={session.items} outcomes={session.outcomes} />;
    }
    return <div className="space-y-6">
        <header className="space-y-4">
            <Link href="/review" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">{t.review.backToList}</Link>
            <h1 className="text-2xl font-bold">{t.review.sessionTitle}</h1>
        </header>
        {!session.items && <div className="space-y-6 rounded-xl border p-4 sm:p-6">
            <p className="text-muted-foreground">{t.review.sessionHint}</p>
            <ReviewSubjectFilter value={subjectId} onChange={setSubjectId} />
            <label className="flex flex-wrap items-center gap-3"><span className="text-sm font-medium">{t.review.limit}</span>
                <select className="min-h-11 rounded-md border bg-background px-3 text-base" value={limit} disabled={session.loading}
                    onChange={event => setLimit(parseReviewLimit(event.target.value))}>
                    <option value="10">{t.review.limitCount.replace('{count}', '10')}</option>
                    <option value="20">{t.review.limitCount.replace('{count}', '20')}</option>
                    <option value="all">{t.review.all}</option>
                </select>
            </label>
            {session.error && <p role="alert" className="text-destructive">{session.error}</p>}
            <Button className="min-h-11 w-full sm:w-auto" disabled={session.loading} onClick={() => session.start(subjectId, limit)}>
                {session.loading ? t.common.loading : t.review.start}
            </Button>
        </div>}
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
