"use client";

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { OriginalReview } from '@/components/review/original-review';
import type { ReviewQuestionState } from '@/components/review/original-review';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useLanguage } from '@/contexts/LanguageContext';
import { confirmDialog } from '@/lib/feedback';
import { savedReviewOutcome } from '@/lib/review-session';
import type { ReviewOutcome } from '@/lib/review-session';
import type { PracticeRecordResponse, ReviewSessionItem } from '@/types/api';

interface ReviewQuestionProps {
    item: ReviewSessionItem;
    index: number;
    total: number;
    active: boolean;
    disabled: boolean;
    revision: number;
    onComplete: (outcome: ReviewOutcome) => void;
    onClose: () => void;
    onStateChange: (state: ReviewQuestionState) => void;
}

export function ReviewQuestion({ item, index, total, active, disabled, revision, onComplete, onClose, onStateChange }: ReviewQuestionProps) {
    const { t } = useLanguage();
    const [state, setState] = useState<ReviewQuestionState>({ busy: false, submitted: false, dirty: false });
    const [error, setError] = useState(false);
    useEffect(() => { if (active) onStateChange(state); }, [active, state, onStateChange]);
    useEffect(() => {
        if (!active || !state.dirty) return;
        const preventLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', preventLeave);
        return () => window.removeEventListener('beforeunload', preventLeave);
    }, [active, state.dirty]);
    function onSaved(record: PracticeRecordResponse) {
        const outcome = savedReviewOutcome(item.id, record);
        if (outcome) onComplete(outcome);
        else setError(true);
    }
    async function leave(skip: boolean) {
        if (state.dirty && !await confirmDialog(t.review.discardAnswer, { destructive: true })) return;
        if (skip) onComplete({ ...item, result: 'skipped' });
        else onClose();
    }
    return <div data-review-layout className="review-focus-layout">
        <header className="space-y-2 pt-[env(safe-area-inset-top)]">
            <div className="grid grid-cols-[5rem_minmax(0,1fr)_5rem] items-center gap-2">
                <Button variant="ghost" className="h-11 w-11" aria-label={t.review.close} disabled={disabled || state.busy}
                    onClick={() => void leave(false)}><X className="h-5 w-5" aria-hidden="true" /></Button>
                <p aria-live="polite" className="truncate text-center text-sm text-muted-foreground">
                    {item.subjectName || t.review.subjectUnknown} · {index + 1} / {total}
                </p>
                {!state.submitted && <Button variant="ghost" className="min-h-11" disabled={disabled || state.busy || error}
                    onClick={() => void leave(true)}>{t.review.skip}</Button>}
            </div>
            <Progress value={index / total * 100} aria-label={t.review.sessionTitle} className="h-1 [&>div]:motion-reduce:transition-none" />
        </header>
        <OriginalReview active={active} id={item.id} onSaved={onSaved} onStateChange={setState} revision={revision} disabled={disabled} />
        {error && <p role="alert" className="text-destructive">{t.review.planMissing}</p>}
    </div>;
}
