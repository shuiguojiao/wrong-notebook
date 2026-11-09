"use client";

import { useEffect, useState } from 'react';
import { AnswerInput } from '@/components/handwriting/answer-input';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { QuestionFigure } from '@/components/question-figure';
import { ReviewActionBar } from '@/components/review/review-action-bar';
import { ReviewGraded } from '@/components/review/review-graded';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

/** 题干和作答优先；提交后立即切换到对比与一步确认，AI 判题在后台更新建议。撤销时保留本题判题结果。 */
export function OriginalReview({ id, onSaved, onStateChange, revision = 0, disabled = false, active = true }: OriginalReviewProps) {
    const { t } = useLanguage();
    const session = useOriginalReview(id, active);
    const [enlarged, setEnlarged] = useState(false);
    const [saving, setSaving] = useState(false);
    const [emptyAnswer, setEmptyAnswer] = useState(false);
    // AI 判题在后台进行，不阻塞关闭、撤销或确认；只有导出笔迹和保存记录时才算忙碌。
    const busy = session.exporting || saving;
    const dirty = !!(session.userAnswer.trim() || session.notes.trim() || session.ink.strokes.length);
    useEffect(() => { onStateChange?.({ busy, submitted: session.submitted, dirty }); }, [busy, session.submitted, dirty, onStateChange]);
    const { item } = session;
    if (!item) return <div role={session.error ? 'alert' : 'status'} className="space-y-3 py-8 text-center">
        <p>{session.error || t.common.loading}</p>
        {session.error && <Button variant="outline" onClick={session.retry}>{t.review.retry}</Button>}
    </div>;
    if (session.submitted) return <ReviewGraded id={id} session={session} revision={revision}
        disabled={disabled} onSaved={onSaved} onBusyChange={setSaving} />;

    function submit() {
        if (!session.userAnswer.trim() && !session.ink.strokes.length) { setEmptyAnswer(true); return; }
        setEmptyAnswer(false);
        void session.submit();
    }
    return <div className="review-answer-layout">
        <Card className="min-w-0 max-h-[42dvh] overflow-y-auto py-4 lg:landscape:max-h-[calc(100dvh-10rem)] lg:landscape:overflow-y-auto">
            <CardContent className="space-y-4 px-4 sm:px-6">
                <MarkdownRenderer content={item.questionText || item.ocrText || ''} />
                <QuestionFigure svg={item.figureSvg} scale={item.figureScale} align={item.figureAlign} />
                {item.originalImageUrl && <div className="text-right">
                    <Button variant="link" className="min-h-11 p-0" onClick={() => setEnlarged(true)}>{t.replaceImage.view}</Button>
                </div>}
                <Dialog open={enlarged} onOpenChange={setEnlarged}>
                    <DialogContent className="max-h-[90dvh] max-w-6xl overflow-auto" aria-describedby={undefined}>
                        <DialogTitle>{t.detail.originalProblem}</DialogTitle>
                        <img src={item.originalImageUrl} alt={t.detail.originalProblem} className="mx-auto max-w-full" />
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
            <Card className="flex-1 py-4"><CardContent className="flex flex-1 flex-col gap-4 px-4 sm:px-6">
                <AnswerInput compact id="review-answer" value={session.userAnswer} onChange={session.setUserAnswer}
                    history={session.ink} onInkChange={session.setInk} readOnly={disabled || session.exporting} error={session.exportError} />
                <details>
                    <summary className="min-h-11 cursor-pointer list-none py-3 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">{t.review.writeNotes}</summary>
                    <label className="sr-only" htmlFor="review-notes">{t.review.notes}</label>
                    <Textarea id="review-notes" value={session.notes} onChange={event => session.setNotes(event.target.value)}
                        maxLength={20000} disabled={disabled || session.exporting} rows={3} />
                </details>
            </CardContent></Card>
            <ReviewActionBar className="space-y-2 lg:landscape:border-0 lg:landscape:p-0">
                {emptyAnswer && <p role="alert" className="text-center text-sm text-destructive">{t.review.answerFirst}</p>}
                <Button className="min-h-12 w-full" disabled={disabled || busy} onClick={submit}>
                    {session.exporting ? t.common.loading : t.review.submit}
                </Button>
            </ReviewActionBar>
        </div>
    </div>;
}
