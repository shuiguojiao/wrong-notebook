"use client";

import Link from 'next/link';
import { CircleHelp, Loader2 } from 'lucide-react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { PracticeResultCard } from '@/components/practice-result-card';
import { AnswerCompare } from '@/components/question/answer-compare';
import { useLanguage } from '@/contexts/LanguageContext';
import type { useOriginalReview } from '@/lib/hooks/use-original-review';
import type { PracticeRecordResponse } from '@/types/api';

interface ReviewGradedProps {
    id: string;
    session: ReturnType<typeof useOriginalReview>;
    revision: number;
    disabled: boolean;
    active: boolean;
    onSaved: (record: PracticeRecordResponse) => void;
    onBusyChange: (busy: boolean) => void;
}

/** 用户仍可在后台判题完成前自行对照并确认结果。 */
export function ReviewGraded({ id, session, revision, disabled, active, onSaved, onBusyChange }: ReviewGradedProps) {
    const { t } = useLanguage();
    const { item, graded, grading } = session;
    if (!item) return null;
    const result = graded?.correct == null ? null : graded.correct ? 'correct' : 'wrong';
    return <div className="review-response min-w-0">
        <div className="review-feedback-body">
            <section role="status" aria-busy={grading} className={`border-b pb-4 ${result ? result === 'correct'
                ? 'text-green-700 dark:text-green-300' : 'text-orange-700 dark:text-orange-300' : 'text-muted-foreground'}`}>
                <h2 className="flex items-center gap-2 text-lg font-medium">
                    {grading && <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {!grading && !result && <CircleHelp className="size-4 shrink-0" aria-hidden="true" />}
                    {result ? result === 'correct' ? t.review.correct : t.student.closeTry : grading ? t.student.gradeChecking : t.student.gradeUnknown}
                </h2>
                {grading && <p className="mt-2 text-sm">{t.student.checkWhileWaiting}</p>}
            </section>
            <AnswerCompare variant="plain" result={result} gradeReason={graded?.reason} rows={[
                { kind: 'mine', content: session.userAnswer, image: session.answerImage },
                { kind: 'previous', content: item.wrongAnswerText || t.review.noPreviousAnswer },
                { kind: 'standard', content: item.answerText || t.review.noAnswer },
            ]} />
            {session.recognizedAnswer && <details className="review-disclosure">
                <summary>{t.handwriting.recognizedAnswer}</summary><MarkdownRenderer content={session.recognizedAnswer} />
            </details>}
            <div className="divide-y border-t">
                <details className="review-disclosure">
                    <summary>{t.practice.detailedAnalysis}</summary>
                    <MarkdownRenderer content={item.analysis || t.review.noAnalysis} className="pb-4" />
                </details>
                <details className="review-disclosure">
                    <summary>{t.student.trySimilar}</summary>
                    <Link target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-primary hover:underline"
                        href={`/practice?id=${encodeURIComponent(id)}`}>{t.student.trySimilar}</Link>
                </details>
            </div>
        </div>
        <PracticeResultCard key={revision} errorItemId={id} source="review" difficulty="" disabled={disabled || !active}
            suggested={result}
            question={{ questionText: '', answerText: '', analysis: '' }} userAnswer={session.userAnswer}
            answerImage={session.answerImage} recognizedAnswer={session.recognizedAnswer}
            durationSec={session.durationSec} notes={session.notes} gradeReason={graded?.reason || null} onSaved={onSaved} onBusyChange={onBusyChange} />
    </div>;
}
