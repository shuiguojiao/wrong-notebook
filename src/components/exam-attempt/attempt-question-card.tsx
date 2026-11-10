"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { AttemptQuestionStem } from "@/components/exam-attempt/attempt-question-stem";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { QuestionFigure } from "@/components/question-figure";
import { ProgressStamp } from "@/components/student/progress-stamp";
import { useLanguage } from "@/contexts/LanguageContext";
import { isResultChanged } from "@/lib/exam/exam-attempt-view";
import { formatExamScore } from "@/lib/exam/exam-score";
import type { AttemptQuestionView } from "@/lib/exam/exam-attempt-view";
import type { PracticeResult } from "@/types/api";

interface AttemptQuestionCardProps extends AttemptQuestionView {
    paperId: string;
    attemptId: string;
    number: number;
    editable: boolean;
    pending: boolean;
    saved: boolean;
    onRegrade?: (questionId: string) => void;
    onChange: (questionId: string, result: PracticeResult) => void;
}

export function AttemptQuestionCard({ question, answer, paperId, attemptId, number, editable, pending, saved, onChange, onRegrade }: AttemptQuestionCardProps) {
    const { t } = useLanguage();
    const [zoom, setZoom] = useState(false);
    const result = answer?.finalResult;
    const labels = { correct: t.examAttempt.correct, wrong: t.student.closeTry, not_attempted: t.examAttempt.notAttempted };
    const selectedStyles = {
        correct: 'bg-emerald-700 text-white hover:bg-emerald-800',
        wrong: 'bg-orange-700 text-white hover:bg-orange-800',
        not_attempted: 'bg-slate-600 text-white hover:bg-slate-700',
    };
    const image = answer?.answerImageUrl ? `/api/exams/${paperId}/attempts/${attemptId}/answers/${question.id}/image` : null;
    const title = t.examAttempt.question.replace('{number}', String(number));
    return (
        <Card id={`question-${question.id}`} tabIndex={-1} data-question-id={question.id} className="scroll-mt-6 scroll-mb-48 min-w-0 py-3 focus-visible:ring-2 focus-visible:ring-ring">
            <CardContent className="space-y-2 px-4">
                <div className="flex min-h-8 flex-wrap items-center gap-3">
                    <h3 className="font-semibold">{title}</h3>
                    {question.score !== null && (
                        <span className="text-sm text-muted-foreground">{t.examAttempt.points.replace('{score}', formatExamScore(question.score))}</span>
                    )}
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                        {isResultChanged(answer) && <span className="text-xs text-muted-foreground">{t.examAttempt.changed}</span>}
                        {result === 'correct' || result === 'wrong' ? (
                            <span className="flex items-center gap-2">
                                <ProgressStamp variant={result === 'correct' ? 'correct' : 'almost'} className={result === 'correct' ? 'attempt-result-stamp rounded-full' : 'attempt-result-stamp rounded-md'} />
                                {result === 'correct' && <span className="text-sm">{labels.correct}</span>}
                            </span>
                        ) : (
                            <span className="rounded-md border border-dashed px-3 py-1 text-sm">{result ? labels[result] : t.examAttempt.unjudged}</span>
                        )}
                    </span>
                </div>
                {question.questionText && <AttemptQuestionStem questionId={question.id} text={question.questionText} />}
                <QuestionFigure svg={question.figureSvg} scale={question.figureScale} align={question.figureAlign} />
                {(image || answer?.answerText || answer?.recognizedAnswer) && (
                    <section className="space-y-2 rounded-md bg-muted/40 p-3">
                        <h4 className="text-sm font-semibold">{t.examAttempt.mine}</h4>
                        {image && (
                            <>
                                <button type="button" className="min-h-11 min-w-11 rounded-md focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setZoom(true)} aria-label={t.examAttempt.viewImage}>
                                    <img src={image} alt={t.examAttempt.imageAlt} loading="lazy" className="max-h-48 max-w-full rounded-md object-contain" />
                                </button>
                                <Dialog open={zoom} onOpenChange={setZoom}>
                                    <DialogContent className="max-w-4xl [&>button]:min-h-11 [&>button]:min-w-11" aria-describedby={undefined}>
                                        <DialogTitle>{title} · {t.examAttempt.mine}</DialogTitle>
                                        <img src={image} alt={t.examAttempt.imageAlt} className="max-h-[75dvh] w-full object-contain" />
                                    </DialogContent>
                                </Dialog>
                            </>
                        )}
                        {answer?.answerText && <MarkdownRenderer content={answer.answerText} />}
                        {answer?.recognizedAnswer && (
                            <details>
                                <summary className="min-h-11 cursor-pointer py-3 text-sm">{t.examAttempt.transcription}</summary>
                                <MarkdownRenderer content={answer.recognizedAnswer} />
                            </details>
                        )}
                    </section>
                )}
                {(answer?.aiResult || answer?.handMark || answer?.aiReason || !result) && <section className="space-y-2 text-sm">
                    {answer?.aiResult === 'correct' || answer?.aiResult === 'wrong' ? (
                        <>
                            <p>{t.examAttempt.aiSays.replace('{result}', labels[answer.aiResult])}</p>
                            {answer.canRetry && onRegrade && editable && <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => onRegrade(question.id)}>{t.examAnswering.regrade}</Button>}
                            {answer.aiReason && <><h4 className="font-semibold">{t.examAttempt.reason}</h4><MarkdownRenderer content={answer.aiReason} /></>}
                        </>
                    ) : (
                        <div className="flex flex-wrap items-center gap-3">
                            <p>{answer?.aiReason === 'AI_DAILY_LIMIT_EXCEEDED' ? t.examAnswering.quotaUsed
                                : answer?.aiReason === 'AI_CONSENT_REQUIRED' ? t.examAnswering.consentRequired
                                : answer?.aiReason?.startsWith('AI_') ? t.examAnswering.aiUnavailable
                                : answer?.aiReason && answer.aiReason !== 'EXAM_GRADE_FAILED' ? answer.aiReason : t.examAnswering.gradeFailed}</p>
                            {answer?.canRetry && onRegrade && editable && <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => onRegrade(question.id)}>{t.examAnswering.regrade}</Button>}
                        </div>
                    )}
                    {(answer?.handMark === 'correct' || answer?.handMark === 'wrong') && <p>{t.examAttempt.handSays.replace('{result}', labels[answer.handMark])}</p>}
                </section>}
                {(answer?.gradingRetries ?? 0) >= 2 && editable && <p className="text-sm text-muted-foreground">{t.examAnswering.regradeLimit}</p>}
                <div className="flex flex-col gap-2 md:flex-row md:items-start">
                    {(question.answerText || question.analysis) && (
                        <details className="min-w-0 flex-1 rounded-md border px-3">
                            <summary className="min-h-11 cursor-pointer py-3 text-sm">{t.examAttempt.reference}</summary>
                            <div className="space-y-3 pb-3">
                                {question.answerText && <MarkdownRenderer content={question.answerText} />}
                                {question.analysis && <MarkdownRenderer content={question.analysis} />}
                            </div>
                        </details>
                    )}
                    {!question.errorItemId ? (
                        <p className="text-sm text-muted-foreground">{t.examAttempt.deleted}</p>
                    ) : editable ? (
                        <div role="group" aria-label={title} className="grid grid-cols-3 gap-2 md:ml-auto md:w-auto md:shrink-0">
                            {(['correct', 'wrong', 'not_attempted'] as const).map(value => (
                                <Button
                                    key={value} aria-pressed={result === value} disabled={pending}
                                    variant={result === value ? 'default' : 'outline'}
                                    className={`h-auto min-h-11 min-w-0 whitespace-normal border px-2 md:min-w-[88px] ${result === value ? `border-transparent ${selectedStyles[value]}` : ''}`}
                                    onClick={() => onChange(question.id, value)}
                                >
                                    <Check aria-hidden="true" className={`size-4 ${result === value ? '' : 'invisible'}`} />
                                    <span>{labels[value]}</span>
                                </Button>
                            ))}
                        </div>
                    ) : saved && result === 'wrong' && (
                        <Button asChild variant="outline" className="min-h-11">
                            <Link href={`/error-items/${question.errorItemId}`}>{t.examAttempt.fix}</Link>
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
