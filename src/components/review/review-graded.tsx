"use client";

import Link from 'next/link';
import { Check, CircleHelp, Loader2, X } from 'lucide-react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { PracticeResultCard } from '@/components/practice-result-card';
import { AnswerCompare } from '@/components/question/answer-compare';
import { ReviewSource } from '@/components/review/review-prompt';
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
    const StatusIcon = grading ? Loader2 : graded ? graded.correct ? Check : X : CircleHelp;
    return <div className="review-response min-w-0">
        <section role="status" aria-busy={grading} className={`border-b pb-4 ${graded ? graded.correct
            ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}>
            <p className="flex items-center gap-2 text-sm font-medium">
                <StatusIcon className={`size-4 shrink-0 ${grading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
                {session.localMatched ? t.review.localMatched : graded ? graded.correct ? t.review.aiCorrect : t.review.aiWrong : grading ? t.review.aiChecking : t.review.checkYourself}
            </p>
            {graded?.reason && <details className="mt-2 text-sm">
                <summary className="min-h-11 cursor-pointer py-3">{t.review.gradeReason}</summary>
                <MarkdownRenderer content={graded.reason} />
            </details>}
        </section>
        <AnswerCompare variant="plain" rows={[
            { kind: 'mine', content: session.userAnswer, image: session.answerImage },
            { kind: 'previous', content: item.wrongAnswerText || t.review.noPreviousAnswer },
            { kind: 'standard', content: item.answerText || t.review.noAnswer },
        ]} />
        {session.recognizedAnswer && <details className="review-disclosure">
            <summary>{t.handwriting.recognizedAnswer}</summary><MarkdownRenderer content={session.recognizedAnswer} />
        </details>}
        <div className="divide-y border-t">
            <div className="lg:landscape:hidden"><ReviewSource errorItemId={item.id} src={item.originalImageUrl} /></div>
            <details className="review-disclosure">
                <summary>{t.practice.detailedAnalysis}</summary>
                <MarkdownRenderer content={item.analysis || t.review.noAnalysis} className="pb-4" />
            </details>
            <details className="review-disclosure">
                <summary>{t.review.practice}</summary>
                <Link target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-primary hover:underline"
                    href={`/practice?id=${encodeURIComponent(id)}`}>{t.review.similar}</Link>
            </details>
        </div>
        <PracticeResultCard key={revision} errorItemId={id} source="review" difficulty="" disabled={disabled || !active}
            suggested={graded ? graded.correct ? 'correct' : 'wrong' : null}
            question={{ questionText: '', answerText: '', analysis: '' }} userAnswer={session.userAnswer}
            answerImage={session.answerImage} recognizedAnswer={session.recognizedAnswer}
            durationSec={session.durationSec} notes={session.notes} gradeReason={graded?.reason || null} onSaved={onSaved} onBusyChange={onBusyChange} />
    </div>;
}
