"use client";

import Link from 'next/link';
import { ReviewQuestionPreview } from '@/components/review/review-question-preview';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTimeZone } from '@/contexts/TimeZoneContext';
import { formatDateTime } from '@/lib/date-time';
import { getReviewProgress } from '@/lib/review-session';
import type { ReviewOutcome } from '@/lib/review-session';
import type { ReviewSessionItem } from '@/types/api';

interface ReviewSummaryProps { items: ReviewSessionItem[]; outcomes: ReviewOutcome[]; onExtra?: () => void; loading?: boolean }

export function ReviewSummary({ items, outcomes, onExtra, loading }: ReviewSummaryProps) {
    const { t } = useLanguage();
    const { timeZone } = useTimeZone();
    const duration = outcomes.reduce((sum, outcome) => sum + (outcome.durationSec ?? 0), 0);
    const progress = getReviewProgress(items, outcomes);
    return <section className="space-y-6">
        <h1 className="text-2xl font-bold">{t.review.summary}</h1>
        <dl className="grid grid-cols-3 gap-3 rounded-xl bg-muted p-4 text-center">
            {(['correct', 'wrong', 'skipped'] as const).map(key => <div key={key}>
                <dt>{key === 'skipped' ? t.review.skipped : t.mastery.results[key]}</dt>
                <dd className="text-2xl font-bold">{progress[key]}</dd>
            </div>)}
        </dl>
        <p className="text-sm text-muted-foreground">{t.review.elapsed.replace('{minutes}', String(Math.floor(duration / 60))).replace('{seconds}', String(duration % 60))}</p>
        <ol className="divide-y rounded-xl border px-4">
            {outcomes.map((outcome, index) => <li key={outcome.id} className="flex min-w-0 flex-col items-start gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/error-items/${encodeURIComponent(outcome.id)}`} className="w-full min-w-0 text-primary underline underline-offset-4 sm:w-auto sm:flex-1">
                    <ReviewQuestionPreview item={items.find(item => item.id === outcome.id)} fallback={t.review.questionNumber.replace('{number}', String(index + 1))} />
                </Link>
                <span>{outcome.result === 'skipped' ? t.review.skipped : t.mastery.results[outcome.result]}</span>
                <span className="text-sm text-muted-foreground">{outcome.result === 'skipped' ? t.review.stillDue : outcome.nextReviewAt
                    ? `${t.review.nextReview}: ${formatDateTime(outcome.nextReviewAt, 'yyyy-MM-dd', timeZone)}` : t.review.scheduleComplete}</span>
            </li>)}
        </ol>
        <div className="flex flex-wrap gap-3">
        {onExtra && <Button className="min-h-11" disabled={loading} onClick={onExtra}>{loading ? t.common.loading : t.review.extra}</Button>}
        <Button asChild variant="outline" className="min-h-11"><Link href="/review" onClick={() => sessionStorage.setItem('review-completed', String(outcomes.length))}>{t.review.backHome}</Link></Button>
        </div>
    </section>;
}
