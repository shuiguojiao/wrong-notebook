"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ReviewQuestionPreview } from '@/components/review/review-question-preview';
import { PaperCard } from '@/components/student/paper-card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ReviewSessionItem } from '@/types/api';

interface ReviewQuestionListProps { items: ReviewSessionItem[]; tomorrowMinutes?: number; open?: boolean; onOpenChange?: (open: boolean) => void; previewLimit?: number }

export function ReviewQuestionList({ items, tomorrowMinutes, open, onOpenChange, previewLimit }: ReviewQuestionListProps) {
    const { t } = useLanguage();
    const [showAll, setShowAll] = useState(false);
    const visible = previewLimit && !showAll ? items.slice(0, previewLimit) : items;
    return <PaperCard><details id="today-questions" open={open} onToggle={event => onOpenChange?.(event.currentTarget.open)}>
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-1 gap-y-2 rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            {tomorrowMinutes !== undefined && <span className="text-muted-foreground">{t.review.tomorrowMinutes.replace('{minutes}', String(Math.ceil(tomorrowMinutes)))}</span>}
            {tomorrowMinutes !== undefined && <span aria-hidden="true" className="text-muted-foreground">·</span>}
            <span className="font-medium text-primary">{t.student.seeQuestions.replace("{count}", String(items.length))}</span>
        </summary>
        <ol className="mt-2 divide-y border-t">
            {visible.map((item, index) => <li key={item.id}>
                <Link href={`/error-items/${encodeURIComponent(item.id)}`} className="flex min-h-11 items-center justify-between gap-4 py-3 hover:text-primary">
                    <ReviewQuestionPreview item={item} fallback={t.review.questionNumber.replace('{number}', String(index + 1))} />
                    <span className="shrink-0 text-sm text-muted-foreground">{item.subjectName || t.review.subjectUnknown}</span>
                </Link>
            </li>)}
        </ol>
        {previewLimit && items.length > previewLimit && <Button variant="link" className="min-h-11 px-0" onClick={() => setShowAll(value => !value)}>{showAll ? t.student.showFirstQuestions.replace("{count}", String(previewLimit)) : t.student.showAllQuestions.replace("{count}", String(items.length))}</Button>}
    </details></PaperCard>;
}
