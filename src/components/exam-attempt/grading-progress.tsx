"use client";

import Link from 'next/link';
import { QuestionNumbers } from '@/components/exam-attempt/question-numbers';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ExamAttemptDetail } from '@/types/api';

interface GradingProgressProps { attempt: ExamAttemptDetail; error: boolean; onRetry: () => void }
export function GradingProgress({ attempt, error, onRetry }: GradingProgressProps) {
    const { t } = useLanguage();
    const items = [...attempt.paper.questions].sort((a, b) => (a.displayNumber ?? a.order) - (b.displayNumber ?? b.order)).map((question, index) => {
        const answer = attempt.answers.find(answer => answer.examQuestionId === question.id);
        return { id: question.id, number: question.displayNumber ?? index + 1, answered: false, flagged: false, graded: !!answer?.aiResult || answer?.finalResult === 'not_attempted' };
    });
    return <main className="mx-auto min-h-dvh max-w-3xl space-y-6 p-4 sm:p-8">
        <Button variant="outline" className="min-h-11" asChild><Link href={`/exams/${attempt.paper.id}`}>{t.examAttempt.back}</Link></Button>
        <h1 className="break-words font-title text-xl font-bold">{attempt.paper.title}</h1>
        <p role="status" className="text-lg">{t.examAnswering.gradingProgress.replace('{done}', String(items.filter(item => item.graded).length)).replace('{total}', String(items.length))}</p>
        <QuestionNumbers items={items} current={-1} progress />
        <p>{t.examAnswering.canLeave}</p>
        {error && <div role="alert"><p>{t.examAttempt.networkError}</p><Button variant="outline" className="min-h-11" onClick={onRetry}>{t.review.retry}</Button></div>}
    </main>;
}
