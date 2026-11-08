"use client";

import { useEffect, useState } from 'react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { PracticeResultCard } from '@/components/practice-result-card';
import { PracticeFeedback } from '@/components/practice/practice-feedback';
import { QuestionFigure } from '@/components/question-figure';
import { ToggleImage } from '@/components/error-detail/toggle-image';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { useOriginalReview } from '@/lib/hooks/use-original-review';
import type { PracticeRecordResponse } from '@/types/api';

interface OriginalReviewProps {
    id: string;
    onSaved: (record: PracticeRecordResponse) => void;
    onBusyChange: (busy: boolean) => void;
}

/** 题干、原图和作答在前；判题后才展示解答与原错答对比。 */
export function OriginalReview({ id, onSaved, onBusyChange }: OriginalReviewProps) {
    const { t } = useLanguage();
    const session = useOriginalReview(id);
    const [showImage, setShowImage] = useState(false);
    const [enlarged, setEnlarged] = useState(false);
    const [saving, setSaving] = useState(false);
    const busy = session.grading || saving;
    useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
    const { item } = session;
    if (!item) return <div role={session.error ? 'alert' : 'status'} className="py-8 text-center space-y-3">
        <p>{session.error || t.common.loading}</p>
        {session.error && <Button variant="outline" onClick={session.retry}>{t.review.retry}</Button>}
    </div>;

    return <div className="space-y-6">
        <Card>
            <CardHeader><CardTitle>{t.detail.question}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <MarkdownRenderer content={item.questionText || item.ocrText || ''} />
                <QuestionFigure svg={item.figureSvg} scale={item.figureScale} align={item.figureAlign} />
                <ToggleImage src={item.originalImageUrl} alt={t.detail.originalProblem}
                    showLabel={t.replaceImage.view} hideLabel={t.replaceImage.hide} visible={showImage}
                    onVisibleChange={setShowImage} onEnlarge={() => setEnlarged(true)} variant="outline" />
                <Dialog open={enlarged} onOpenChange={setEnlarged}>
                    <DialogContent className="max-h-[90dvh] max-w-6xl overflow-auto" aria-describedby={undefined}>
                        <DialogTitle>{t.detail.originalProblem}</DialogTitle>
                        <img src={item.originalImageUrl} alt={t.detail.originalProblem} className="mx-auto max-w-full" />
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
        <Card>
            <CardContent className="space-y-4 pt-6">
                <label className="block space-y-2" htmlFor="review-answer"><span className="font-medium">{t.app.yourAnswer}</span>
                    <Textarea id="review-answer" value={session.userAnswer} onChange={event => session.setUserAnswer(event.target.value)}
                        maxLength={5000} disabled={session.submitted} rows={3} />
                </label>
                <label className="block space-y-2" htmlFor="review-notes"><span>{t.review.notes}</span>
                    <Textarea id="review-notes" value={session.notes} onChange={event => session.setNotes(event.target.value)}
                        maxLength={20000} disabled={session.submitted} rows={3} />
                </label>
            </CardContent>
        </Card>
        <PracticeFeedback isSubmitted={session.submitted} grading={session.grading} isCorrect={session.graded?.correct ?? null}
            gradeFailed={session.gradeFailed} gradeReason={session.graded?.reason ?? null} notes={session.notes}
            canSubmit={!!session.userAnswer.trim()} onSubmit={session.submit} onReveal={() => {}} allowReveal={false} />
        {session.submitted && !session.grading && <>
            <Card>
                <CardHeader><CardTitle>{t.practice.correctAnswer}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <MarkdownRenderer content={item.answerText || t.review.noAnswer} />
                    <h3 className="font-semibold">{t.practice.detailedAnalysis}</h3>
                    <MarkdownRenderer content={item.analysis || ''} />
                    <h3 className="font-semibold">{t.review.previousAnswer}</h3>
                    <MarkdownRenderer content={item.wrongAnswerText || t.review.noPreviousAnswer} />
                    <h3 className="font-semibold">{t.app.yourAnswer}</h3>
                    <MarkdownRenderer content={session.userAnswer} />
                </CardContent>
            </Card>
            <PracticeResultCard errorItemId={id} source="review" difficulty=""
                suggested={session.graded ? session.graded.correct ? 'correct' : 'wrong' : null}
                question={{ questionText: '', answerText: '', analysis: '' }} userAnswer={session.userAnswer}
                notes={session.notes} gradeReason={session.graded?.reason ?? null} onSaved={onSaved} onBusyChange={setSaving} />
        </>}
    </div>;
}
