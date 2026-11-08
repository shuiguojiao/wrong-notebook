"use client";

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ReviewSessionItem } from '@/types/api';

interface ReviewQuestionListProps { items: ReviewSessionItem[]; tomorrowMinutes?: number }

export function ReviewQuestionList({ items, tomorrowMinutes }: ReviewQuestionListProps) {
    const { t } = useLanguage();
    return <details className="rounded-xl border px-4">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
            {tomorrowMinutes !== undefined && <span className="text-sm text-muted-foreground">{t.review.tomorrowMinutes.replace('{minutes}', String(Math.ceil(tomorrowMinutes)))}</span>}
            <span className="font-medium">{t.review.viewQuestions}</span>
        </summary>
        <ol className="divide-y">
            {items.map((item, index) => <li key={item.id}>
                <Link href={`/error-items/${encodeURIComponent(item.id)}`} className="flex min-h-11 items-center justify-between gap-4 py-3 hover:text-primary">
                    <span className="min-w-0 truncate">{item.questionPreview || t.review.questionNumber.replace('{number}', String(index + 1))}</span>
                    <span className="shrink-0 text-sm text-muted-foreground">{item.subjectName || t.review.subjectUnknown}</span>
                </Link>
            </li>)}
        </ol>
    </details>;
}
