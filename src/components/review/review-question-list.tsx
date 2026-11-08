"use client";

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ReviewSessionItem } from '@/types/api';

interface ReviewQuestionListProps { items: ReviewSessionItem[] }

export function ReviewQuestionList({ items }: ReviewQuestionListProps) {
    const { t } = useLanguage();
    return <details className="rounded-xl border px-4">
        <summary className="min-h-11 cursor-pointer py-3 font-medium">{t.review.viewQuestions}</summary>
        {items.length > 20 && <p className="pb-3 text-sm text-muted-foreground">{t.review.firstTwenty.replace('{total}', String(items.length))}</p>}
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
