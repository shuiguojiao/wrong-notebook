"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTimeZone } from '@/contexts/TimeZoneContext';
import { formatDateTime } from '@/lib/date-time';
import { getReviewProgress } from '@/lib/review-session';
import type { ReviewOutcome } from '@/lib/review-session';
import type { ReviewSessionItem } from '@/types/api';

interface ReviewSummaryProps { items: ReviewSessionItem[]; outcomes: ReviewOutcome[] }

export function ReviewSummary({ items, outcomes }: ReviewSummaryProps) {
    const { t } = useLanguage();
    const { timeZone } = useTimeZone();
    const progress = getReviewProgress(items, outcomes);
    return <section className="space-y-6">
        <h1 className="text-2xl font-bold">{t.review.summary}</h1>
        <dl className="grid grid-cols-3 gap-3 rounded-xl bg-muted p-4 text-center">
            {(['correct', 'wrong', 'skipped'] as const).map(key => <div key={key}>
                <dt>{key === 'skipped' ? t.review.skipped : t.mastery.results[key]}</dt>
                <dd className="text-2xl font-bold">{progress[key]}</dd>
            </div>)}
        </dl>
        <ol className="divide-y rounded-xl border px-4">
            {outcomes.map((outcome, index) => <li key={outcome.id} className="flex flex-wrap items-center justify-between gap-2 py-4">
                <Link href={`/error-items/${encodeURIComponent(outcome.id)}`} className="text-primary underline underline-offset-4">
                    {t.review.questionNumber.replace('{number}', String(index + 1))}
                </Link>
                <span>{outcome.result === 'skipped' ? t.review.skipped : t.mastery.results[outcome.result]}</span>
                <span className="text-sm text-muted-foreground">{t.review.nextReview}: {outcome.nextReviewAt
                    ? formatDateTime(outcome.nextReviewAt, 'yyyy-MM-dd', timeZone) : t.review.scheduleComplete}</span>
            </li>)}
        </ol>
        <Button asChild className="min-h-11"><Link href="/review">{t.review.backToList}</Link></Button>
    </section>;
}
