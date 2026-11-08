"use client";

import { useState } from 'react';
import { OriginalReview } from '@/components/review/original-review';
import { PracticeSession } from '@/components/practice/practice-session';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { savedReviewOutcome } from '@/lib/review-session';
import type { ReviewOutcome } from '@/lib/review-session';
import type { PracticeRecordResponse, ReviewSessionItem } from '@/types/api';

interface ReviewQuestionProps {
    item: ReviewSessionItem;
    last: boolean;
    onComplete: (outcome: ReviewOutcome) => void;
}

export function ReviewQuestion({ item, last, onComplete }: ReviewQuestionProps) {
    const { t } = useLanguage();
    const [mode, setMode] = useState<'original' | 'practice'>('original');
    const [practiceActivated, setPracticeActivated] = useState(false);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState<ReviewOutcome | null>(null);
    const [error, setError] = useState(false);
    function onSaved(record: PracticeRecordResponse) {
        const outcome = savedReviewOutcome(item.id, record);
        if (outcome) setSaved(outcome);
        else setError(true);
    }
    return <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2" role="group" aria-label={t.review.mode}>
                {(['original', 'practice'] as const).map(value => <Button key={value} className="min-h-11"
                    variant={mode === value ? 'default' : 'outline'} aria-pressed={mode === value} disabled={busy || !!saved || error}
                    onClick={() => { setMode(value); if (value === 'practice') setPracticeActivated(true); }}>
                    {value === 'original' ? t.review.original : t.review.practice}
                </Button>)}
            </div>
            {!saved && <Button variant="ghost" className="min-h-11" disabled={busy || error}
                onClick={() => onComplete({ ...item, result: 'skipped' })}>{t.review.skip}</Button>}
        </div>
        {/* 切换方式保留本题草稿；首次进入原题时不挂载举一反三，也不生成下一题。 */}
        <div hidden={mode !== 'original'}><OriginalReview id={item.id} onSaved={onSaved} onBusyChange={setBusy} /></div>
        {practiceActivated && <div hidden={mode !== 'practice'}>
            <PracticeSession errorItemId={item.id} embedded onSaved={onSaved} onBusyChange={setBusy} />
        </div>}
        {error && <p role="alert" className="text-destructive">{t.review.planMissing}</p>}
        {saved && <Button className="min-h-11 w-full sm:w-auto" onClick={() => onComplete(saved)}>
            {last ? t.review.finish : t.review.next}
        </Button>}
    </div>;
}
