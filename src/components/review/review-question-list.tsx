"use client";

import Link from 'next/link';
import { ReviewQuestionPreview } from '@/components/review/review-question-preview';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ReviewSessionItem } from '@/types/api';

interface ReviewQuestionListProps { items: ReviewSessionItem[]; tomorrowMinutes?: number }

export function ReviewQuestionList({ items, tomorrowMinutes }: ReviewQuestionListProps) {
    const { t } = useLanguage();
    return <details>
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-1 gap-y-2 rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            {tomorrowMinutes !== undefined && <span className="text-muted-foreground">{t.review.tomorrowMinutes.replace('{minutes}', String(Math.ceil(tomorrowMinutes)))}</span>}
            {tomorrowMinutes !== undefined && <span aria-hidden="true" className="text-muted-foreground">·</span>}
            <span className="font-medium text-primary">{t.review.viewQuestions}</span>
        </summary>
        <ol className="mt-2 divide-y border-t">
            {items.map((item, index) => <li key={item.id}>
                <Link href={`/error-items/${encodeURIComponent(item.id)}`} className="flex min-h-11 items-center justify-between gap-4 py-3 hover:text-primary">
                    <ReviewQuestionPreview item={item} fallback={t.review.questionNumber.replace('{number}', String(index + 1))} />
                    <span className="shrink-0 text-sm text-muted-foreground">{item.subjectName || t.review.subjectUnknown}</span>
                </Link>
            </li>)}
        </ol>
    </details>;
}
