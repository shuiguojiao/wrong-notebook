"use client";

import { useEffect, useState } from 'react';
import { OriginalReview } from '@/components/review/original-review';
import type { ReviewQuestionState } from '@/components/review/original-review';
import { Button } from '@/components/ui/button';
import { FocusCard } from '@/components/ui/focus-card';
import { useLanguage } from '@/contexts/LanguageContext';
import { confirmDialog } from '@/lib/feedback';
import { savedReviewOutcome } from '@/lib/review-session';
import type { ReviewOutcome } from '@/lib/review-session';
import type { PracticeRecordResponse, ReviewSessionItem } from '@/types/api';

interface ReviewQuestionProps {
    item: ReviewSessionItem;
    index: number;
    total: number;
    remainingMinutes?: number;
    brave?: boolean;
    active: boolean;
    disabled: boolean;
    revision: number;
    onComplete: (outcome: ReviewOutcome) => void;
    onClose: () => void;
    onStateChange: (state: ReviewQuestionState) => void;
}

export function ReviewQuestion({ item, index, total, remainingMinutes, brave = false, active, disabled, revision, onComplete, onClose, onStateChange }: ReviewQuestionProps) {
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
    const progress = t.student.reviewProgress.replace('{subject}', brave ? t.rewards.braveSessionTitle : item.subjectName || t.review.subjectUnknown)
        .replace('{current}', String(index + 1)).replace('{total}', String(total));
    const title = remainingMinutes == null ? progress : `${progress} · ${t.student.reviewRemaining.replace('{minutes}', String(remainingMinutes))}`;
    return <FocusCard className="review-focus-layout" title={title}
        progress={index / total * 100} closeLabel={t.review.close} closeDisabled={disabled || state.busy}
        onClose={() => { if (!disabled && !state.busy) void leave(false); }}
        headerActions={!state.submitted && <Button variant="ghost" className="min-h-11" disabled={disabled || state.busy || error}
            onClick={() => void leave(true)}>{t.review.skip}</Button>}>
        <OriginalReview active={active} id={item.id} onSaved={onSaved} onStateChange={setState} revision={revision} disabled={disabled} />
        {error && <p role="alert" className="text-destructive">{t.review.planMissing}</p>}
    </FocusCard>;
}
