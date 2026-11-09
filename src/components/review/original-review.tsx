"use client";

import { useEffect, useState } from 'react';
import { PencilLine } from 'lucide-react';
import { AnswerInput } from '@/components/handwriting/answer-input';
import { ReviewActionBar } from '@/components/review/review-action-bar';
import { ReviewGraded } from '@/components/review/review-graded';
import { ReviewPrompt } from '@/components/review/review-prompt';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { useOriginalReview } from '@/lib/hooks/use-original-review';
import type { PracticeRecordResponse } from '@/types/api';

export interface ReviewQuestionState { busy: boolean; submitted: boolean; dirty: boolean }
interface OriginalReviewProps {
    id: string;
    onSaved: (record: PracticeRecordResponse) => void;
    onStateChange?: (state: ReviewQuestionState) => void;
    revision?: number;
    disabled?: boolean;
    active?: boolean;
}

/** 卡片内原地切换作答与对照；判题在后台更新建议，撤销时保留结果。 */
export function OriginalReview({ id, onSaved, onStateChange, revision = 0, disabled = false, active = true }: OriginalReviewProps) {
    const { t } = useLanguage();
    const session = useOriginalReview(id, active);
    const [saving, setSaving] = useState(false);
    const [emptyAnswer, setEmptyAnswer] = useState(false);
    // 后台判题不阻塞关闭和确认，只有导出笔迹和保存记录时算忙碌。
    const busy = session.exporting || saving;
    const dirty = !!(session.userAnswer.trim() || session.notes.trim() || session.ink.strokes.length);
    useEffect(() => { onStateChange?.({ busy, submitted: session.submitted, dirty }); }, [busy, session.submitted, dirty, onStateChange]);
    function submit() {
        if (!active || disabled || busy || session.submitted) return;
        if (!session.userAnswer.trim() && !session.ink.strokes.length) { setEmptyAnswer(true); return; }
        setEmptyAnswer(false);
        void session.submit();
    }
    useEffect(() => {
        if (!active || disabled || busy || session.submitted) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.isComposing || event.repeat || event.defaultPrevented) return;
            if (document.querySelector('[role="dialog"]')) return;
            event.preventDefault();
            submit();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    });
    const { item } = session;
    if (!item) return <div role={session.error ? 'alert' : 'status'} className="space-y-3 py-8 text-center">
        <p>{session.error || t.common.loading}</p>
        {session.error && <Button variant="outline" onClick={session.retry}>{t.review.retry}</Button>}
    </div>;
    return <div className="review-answer-layout">
        <ReviewPrompt item={item} submitted={session.submitted} />
        {session.submitted ? <ReviewGraded id={id} session={session} revision={revision} active={active}
            disabled={disabled} onSaved={onSaved} onBusyChange={setSaving} /> : <div className="review-response min-w-0">
            <div className="flex flex-1 flex-col gap-3">
                <AnswerInput variant="card" id={`review-answer-${id}`} value={session.userAnswer}
                    onChange={value => { session.setUserAnswer(value); setEmptyAnswer(false); }}
                    history={session.ink} onInkChange={value => { session.setInk(value); setEmptyAnswer(false); }}
                    readOnly={disabled || session.exporting} error={session.exportError}
                    validationError={emptyAnswer ? t.review.answerFirst : null} />
                <details>
                    <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
                        <PencilLine className="size-4" aria-hidden="true" />{t.review.writeNotes}
                    </summary>
                    <label className="sr-only" htmlFor={`review-notes-${id}`}>{t.review.notes}</label>
                    <Textarea id={`review-notes-${id}`} value={session.notes} onChange={event => session.setNotes(event.target.value)}
                        maxLength={20000} disabled={disabled || session.exporting} rows={3} />
                </details>
            </div>
            <ReviewActionBar className="lg:landscape:border-0 lg:landscape:pb-0">
                <Button className="min-h-12 w-full" disabled={disabled || busy} onClick={submit}>
                    {session.exporting ? t.common.loading : t.review.submit}
                </Button>
            </ReviewActionBar>
        </div>}
    </div>;
}
