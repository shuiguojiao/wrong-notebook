"use client";

import Link from 'next/link';
import { ReviewQuestionPreview } from '@/components/review/review-question-preview';
import { PaperCard } from '@/components/student/paper-card';
import { ProgressStamp } from '@/components/student/progress-stamp';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { SessionProgress } from '@/lib/hooks/use-session-progress';
import { getReviewProgress, getReviewSummary } from '@/lib/review-session';
import type { ReviewOutcome } from '@/lib/review-session';
import type { ReviewSessionItem } from '@/types/api';

interface ReviewSummaryProps {
    progress?: SessionProgress | null;
    items: ReviewSessionItem[];
    outcomes: ReviewOutcome[];
    mode?: 'today' | 'extra';
    completionDate?: string;
    onExtra?: () => void;
    loading?: boolean;
}

export function ReviewSummary({ progress: sessionProgress, items, outcomes, mode = 'today', completionDate, onExtra, loading }: ReviewSummaryProps) {
    const { t } = useLanguage();
    const progress = getReviewProgress(items, outcomes);
    const summary = getReviewSummary(outcomes);
    const mastered = sessionProgress?.mastered ?? summary.mastered;
    const cleared = mode === 'today' && !!completionDate && items.length > 0 && progress.completed === items.length && progress.skipped === 0;
    const metrics = [
        { label: t.review.summaryCorrect, value: progress.correct },
        { label: t.student.seeTomorrow, value: progress.wrong },
        { label: t.review.summaryMastered, value: mastered ?? '–' },
    ];
    return <section className="mx-auto max-w-2xl space-y-6 pb-20" aria-label={t.review.summary}>
        <header className="space-y-3 text-center">
            {cleared && completionDate && <ProgressStamp variant="done" date={completionDate} />}
            {cleared && sessionProgress && <ProgressStamp variant="streak" days={sessionProgress.streak} />}
            {!!sessionProgress?.newStickers.length && <p><Link href="/collection" className="inline-flex min-h-11 items-center text-primary underline">{t.student.newSticker} · {sessionProgress.newStickers.map(sticker => sticker.name).join(" · ")}</Link></p>}
            <h1 className="font-title text-2xl font-bold sm:text-3xl">{cleared ? t.review.summaryCleared : t.review.summaryGroupDone}</h1>
            <p className="text-sm text-muted-foreground">{t.review.summaryElapsed.replace('{count}', String(summary.answered)).replace('{minutes}', String(Math.ceil(summary.durationSec / 60)))}</p>
        </header>
        <dl className="grid grid-cols-3 gap-2 text-center sm:gap-4">
            {metrics.map(metric => <div key={metric.label} className="flex flex-col-reverse gap-2 rounded-xl border bg-card px-2 py-4">
                <dt className="text-sm">{metric.label}</dt>
                <dd className="text-2xl font-bold tabular-nums">{metric.value}</dd>
            </div>)}
        </dl>
        {mastered === null && <p className="text-center text-sm text-muted-foreground">{t.review.masteryPending}</p>}
        {progress.skipped > 0 && <p className="text-center text-sm text-muted-foreground">{t.review.summarySkipped.replace('{count}', String(progress.skipped))}</p>}
        <PaperCard>
            <div className="space-y-5">
                <h2 className="font-title text-lg font-semibold">{t.review.todayProgress}</h2>
                {(['correct', 'wrong'] as const).map(result => {
                    const group = outcomes.filter(outcome => outcome.result === result);
                    if (!group.length) return null;
                    return <div key={result} className="space-y-2">
                        <h3 className="text-sm font-medium">{result === 'correct' ? t.review.summaryCorrect : t.student.seeTomorrow}</h3>
                        <ol className="divide-y">
                            {group.map(outcome => <li key={outcome.id}>
                                <Link href={`/error-items/${encodeURIComponent(outcome.id)}`} className="block min-h-11 rounded-sm py-3 text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                                    <ReviewQuestionPreview item={items.find(item => item.id === outcome.id)} fallback={t.review.questionNumber.replace('{number}', String(items.findIndex(item => item.id === outcome.id) + 1))} />
                                </Link>
                            </li>)}
                        </ol>
                    </div>;
                })}
                {summary.answered === 0 && <p className="text-sm text-muted-foreground">{t.review.noSavedAnswers}</p>}
            </div>
        </PaperCard>
        <div className="flex flex-col gap-3">
            <Button asChild variant="link" className="min-h-11"><Link href="/history">{t.history.viewToday}</Link></Button>
            <Button asChild className="min-h-12"><Link href="/" onClick={() => sessionStorage.setItem('review-completed', String(summary.answered))}>{t.review.wrapUp}</Link></Button>
            {onExtra && <Button variant="ghost" className="min-h-11 whitespace-normal" disabled={loading} onClick={onExtra}>{loading ? t.common.loading : t.review.extraPrompt}</Button>}
        </div>
    </section>;
}
