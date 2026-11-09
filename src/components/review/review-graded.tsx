"use client";

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { PracticeResultCard } from '@/components/practice-result-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import type { useOriginalReview } from '@/lib/hooks/use-original-review';
import type { PracticeRecordResponse } from '@/types/api';

interface ReviewGradedProps {
    id: string;
    session: ReturnType<typeof useOriginalReview>;
    revision: number;
    disabled: boolean;
    onSaved: (record: PracticeRecordResponse) => void;
    onBusyChange: (busy: boolean) => void;
}

/** 判题结果只供参考，用户点一次对错便保存并继续；AI 仍在核对时也可先自行对照确认。 */
export function ReviewGraded({ id, session, revision, disabled, onSaved, onBusyChange }: ReviewGradedProps) {
    const { t } = useLanguage();
    const { item, graded, grading } = session;
    if (!item) return null;
    return <div className="space-y-4">
        <section role="status" aria-busy={grading} className={`rounded-xl p-4 ${graded ? graded.correct
            ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
            : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200' : 'bg-muted'}`}>
            <p className="flex items-center gap-2 font-semibold">
                {grading && <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {session.localMatched ? t.review.localMatched : graded ? graded.correct ? t.review.aiCorrect : t.review.aiWrong : grading ? t.review.aiChecking : t.review.checkYourself}
            </p>
            {graded?.reason && <details className="mt-2 text-sm">
                <summary className="cursor-pointer truncate">{graded.reason}</summary>
                <MarkdownRenderer content={graded.reason} />
            </details>}
        </section>
        <div className="grid items-start gap-4 lg:landscape:grid-cols-3">
            <div className="grid gap-3 min-[360px]:grid-cols-2 lg:landscape:col-span-2">
                <Card className="min-w-0 py-4"><CardContent className="space-y-3 px-4">
                    <h2 className="font-semibold">{t.review.thisAnswer}</h2>
                    {session.userAnswer.trim() && <MarkdownRenderer content={session.userAnswer} />}
                    {session.answerImage && <img src={session.answerImage} alt={t.handwriting.canvas} className="max-h-48 max-w-full rounded-md object-contain" />}
                    {session.recognizedAnswer && <details><summary className="cursor-pointer text-sm">{t.handwriting.recognizedAnswer}</summary><MarkdownRenderer content={session.recognizedAnswer} /></details>}
                </CardContent></Card>
                <Card className="min-w-0 border-red-200 bg-red-50 py-4 dark:border-red-900 dark:bg-red-950"><CardContent className="space-y-3 px-4">
                    <h2 className="font-semibold">{t.review.previousAnswer}</h2>
                    <MarkdownRenderer content={item.wrongAnswerText || t.review.noPreviousAnswer} />
                </CardContent></Card>
            </div>
            <Card className="min-w-0 py-4"><CardContent className="space-y-3 px-4">
                <h2 className="font-semibold">{t.review.standardAnswer}</h2>
                <MarkdownRenderer content={item.answerText || t.review.noAnswer} />
            </CardContent></Card>
        </div>
        <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold">{t.practice.detailedAnalysis}</summary>
            <MarkdownRenderer content={item.analysis || t.review.noAnalysis} className="mt-4" />
        </details>
        <Button asChild variant="link" className="min-h-11 px-0"><Link target="_blank" rel="noopener noreferrer" href={`/practice?id=${encodeURIComponent(id)}`}>{t.review.similar}</Link></Button>
        <PracticeResultCard key={revision} errorItemId={id} source="review" difficulty="" disabled={disabled}
            suggested={graded ? graded.correct ? 'correct' : 'wrong' : null}
            question={{ questionText: '', answerText: '', analysis: '' }} userAnswer={session.userAnswer}
            answerImage={session.answerImage} recognizedAnswer={session.recognizedAnswer}
            durationSec={session.durationSec} notes={session.notes} gradeReason={graded?.reason || null} onSaved={onSaved} onBusyChange={onBusyChange} />
    </div>;
}
