"use client";

import { useEffect, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { OriginalReview } from '@/components/review/original-review';
import type { ReviewQuestionState } from '@/components/review/original-review';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FocusCard } from '@/components/ui/focus-card';
import { useLanguage } from '@/contexts/LanguageContext';
import { confirmDialog } from '@/lib/feedback';
import { savedReviewOutcome } from '@/lib/review-session';
import type { ReviewOutcome } from '@/lib/review-session';
import type { GeneratedReviewVariant } from '@/lib/hooks/use-review-variants';
import type { PracticeRecordResponse, ReviewSessionItem } from '@/types/api';

interface ReviewQuestionProps {
    item: ReviewSessionItem;
    variant?: GeneratedReviewVariant | null;
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

export function ReviewQuestion({ item, variant, index, total, remainingMinutes, brave = false, active, disabled, revision, onComplete, onClose, onStateChange }: ReviewQuestionProps) {
    const { t } = useLanguage();
    const [state, setState] = useState<ReviewQuestionState>({ busy: false, submitted: false, dirty: false });
    const [error, setError] = useState(false);
    const [switchedToOriginal, setSwitchedToOriginal] = useState(false);
    const wantsVariant = item.useVariant && !switchedToOriginal && !brave;
    const shownVariant = wantsVariant ? variant : undefined;
    const generating = wantsVariant && variant === undefined;
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
    async function switchToOriginal() {
        if (state.dirty && !await confirmDialog(t.review.discardAnswer, { destructive: true })) return;
        setState({ busy: false, submitted: false, dirty: false });
        setSwitchedToOriginal(true);
    }
    const progress = t.student.reviewProgress.replace('{subject}', brave ? t.rewards.braveSessionTitle : item.subjectName || t.review.subjectUnknown)
        .replace('{current}', String(index + 1)).replace('{total}', String(total));
    const title = remainingMinutes == null ? progress : `${progress} · ${t.student.reviewRemaining.replace('{minutes}', String(remainingMinutes))}`;
    return <FocusCard className="review-focus-layout" title={title}
        titleBadge={wantsVariant && variant !== null && <span className="student-sticker inline-block rounded-full border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{t.review.variantBadge}</span>}
        progress={index / total * 100} closeLabel={t.review.close} closeDisabled={disabled || state.busy}
        onClose={() => { if (!disabled && !state.busy) void leave(false); }}
        headerActions={!state.submitted && <div className="flex flex-wrap justify-end gap-2">
            {wantsVariant && variant !== null && <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-11" aria-label={t.review.variantMore} disabled={disabled || state.busy}>
                    <Ellipsis aria-hidden="true" />
                </Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end"><DropdownMenuItem className="min-h-11" onSelect={() => void switchToOriginal()}>
                    {t.review.switchToOriginal}
                </DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>}
            <Button variant="ghost" className="min-h-11" disabled={disabled || state.busy || error}
                onClick={() => void leave(true)}>{t.review.skip}</Button>
        </div>}>
        {generating ? <p role="status" className="py-8 text-center">{t.common.loading}</p> : <>
            {shownVariant === null && <p role="status" className="mb-3 text-sm text-muted-foreground">{t.review.variantFallback}</p>}
            <OriginalReview key={shownVariant ? 'variant' : 'original'} active={active} id={item.id} variant={shownVariant ?? undefined}
                onSaved={onSaved} onStateChange={setState} revision={revision} disabled={disabled} />
        </>}
        {error && <p role="alert" className="text-destructive">{t.review.planMissing}</p>}
    </FocusCard>;
}
