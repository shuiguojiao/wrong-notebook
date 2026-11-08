"use client";

import { useLanguage } from '@/contexts/LanguageContext';
import { parseReviewLimit } from '@/lib/review-session';
import type { ReviewLimit } from '@/lib/review-session';

interface ReviewLimitSelectProps {
    value: ReviewLimit;
    onChange: (value: ReviewLimit) => void;
    disabled?: boolean;
}

export function ReviewLimitSelect({ value, onChange, disabled }: ReviewLimitSelectProps) {
    const { t } = useLanguage();
    return <label className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{t.review.limit}</span>
        <select className="min-h-11 rounded-md border bg-background px-3 text-base" value={value} disabled={disabled}
            onChange={event => onChange(parseReviewLimit(event.target.value))}>
            <option value="10">{t.review.limitCount.replace('{count}', '10')}</option>
            <option value="20">{t.review.limitCount.replace('{count}', '20')}</option>
            <option value="all">{t.review.all}</option>
        </select>
    </label>;
}
