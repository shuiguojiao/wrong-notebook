"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag } from 'lucide-react';
import { ExamAnswerEditor } from '@/components/exam-attempt/exam-answer-editor';
import { QuestionNumbers } from '@/components/exam-attempt/question-numbers';
import { SubmitPanel } from '@/components/exam-attempt/submit-panel';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { AnsweringFigure } from '@/components/exam-attempt/answering-figure';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/page-loading';
import { useLanguage } from '@/contexts/LanguageContext';
import { hasExamAnswer } from '@/lib/exam/exam-answering-draft';
import { formatExamScore } from '@/lib/exam/exam-score';
import { useExamAnswering } from '@/lib/hooks/use-exam-answering';
import { useInkGuard } from '@/lib/hooks/use-ink-guard';
import type { ExamAttemptDetail } from '@/types/api';
import './exam-answering.css';

interface ExamAnsweringProps { attempt: ExamAttemptDetail; onSubmitted: () => Promise<void> }
export function ExamAnswering({ attempt, onSubmitted }: ExamAnsweringProps) {
    const { t } = useLanguage();
    const router = useRouter();
    const state = useExamAnswering(attempt, onSubmitted);
    const guard = useInkGuard();
    const [confirming, setConfirming] = useState(false);
    const [photoBusy, setPhotoBusy] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const busy = state.busy || photoBusy || preparing;
    if (!state.ready) return <PageLoading label={t.common.loading} />;
    const items = state.questions.map((question, index) => ({ id: question.id, number: question.displayNumber ?? index + 1, answered: hasExamAnswer(state.drafts[question.id]), flagged: state.drafts[question.id].flagged }));
    const answered = items.filter(item => item.answered).length;
    const prepareSubmit = async () => {
        if (busy) return;
        setPreparing(true);
        if (await state.flush()) setConfirming(true);
        setPreparing(false);
    };
    return <main className="exam-answering mx-auto min-h-dvh max-w-[1440px] px-4 pb-28 pt-3 sm:px-6 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden" data-testid="exam-answering">
        <header className="shrink-0 space-y-1 border-b pb-2">
            <div className="flex items-center gap-2 sm:gap-4">
                <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => { void state.saveForExit().then(saved => { if (saved) router.push(`/exams/${attempt.paper.id}`); }); }}>{t.examAnswering.exit}</Button>
                <h1 className="min-w-0 flex-1 truncate font-title text-lg font-semibold">{attempt.paper.title}</h1>
                <Button className="ml-auto min-h-11" disabled={busy} onPointerDown={guard.onPointerDown} onClick={event => { guard.onClick(event); if (!event.defaultPrevented) void prepareSubmit(); }}>{state.busy || preparing ? t.examAnswering.waitingSave : t.examAnswering.submit}</Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 lg:flex-row-reverse">
                <p className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground lg:flex-none" role="status">{t.examAnswering[state.status]}</p>
                <Button variant="ghost" className="min-h-11 shrink-0 px-2 tabular-nums" onClick={state.toggleTimer} aria-label={state.timerHidden ? t.examAnswering.showTimer : t.examAnswering.hideTimer}>{state.timerHidden ? t.examAnswering.showTimer : `${Math.floor(state.seconds / 60)}:${String(state.seconds % 60).padStart(2, '0')}`}</Button>
                <span className="shrink-0 text-xs sm:text-sm">{t.examAnswering.answeredCount.replace('{answered}', String(answered)).replace('{total}', String(items.length))}</span>
                <div className="order-first min-w-0 has-[button[aria-expanded=true]]:w-full lg:order-none lg:flex-1">
                    <QuestionNumbers items={items} current={state.current} onSelect={index => { if (!busy && !confirming) state.navigate(index); }} />
                </div>
            </div>
        </header>
        {(state.error || state.draftError) && <div role="alert" className="flex flex-wrap items-center gap-3 py-3">
            <p className="text-destructive">{state.draftError ? t.examAnswering.draftStorageError : t.examAttempt.networkError}</p>
            <Button variant="outline" className="min-h-11" onClick={() => void onSubmitted()}>{t.review.retry}</Button>
        </div>}
        {state.imageError && <div role="alert" className="flex flex-wrap items-center gap-3 py-3">
            <p>{t.handwriting[state.imageError.key]}</p>
            <Button variant="outline" className="min-h-11" onClick={() => state.navigate(state.questions.findIndex(question => question.id === state.imageError?.questionId))}>{t.examAttempt.question.replace('{number}', String(items.find(item => item.id === state.imageError?.questionId)?.number))}</Button>
        </div>}
        {state.questions.map((question, index) => state.visited.has(index) && <div key={question.id} hidden={index !== state.current} className="min-h-0 lg:flex-1">
            <div className="grid min-w-0 gap-6 py-5 lg:h-full lg:min-h-0 lg:grid-cols-2 lg:gap-8">
                <section className="min-w-0 space-y-4 lg:overflow-y-auto lg:border-r lg:pr-8" aria-label={t.app.practiceProblem}>
                    <h2 className="font-semibold">{t.examAttempt.question.replace('{number}', String(items[index].number))}{question.score !== null && <span className="ml-3 text-sm font-normal text-muted-foreground">{t.examAttempt.points.replace('{score}', formatExamScore(question.score))}</span>}</h2>
                    <MarkdownRenderer content={question.questionText ?? ''} />
                    <AnsweringFigure question={question} />
                    <Button variant="outline" className="min-h-11" disabled={busy} aria-pressed={state.drafts[question.id].flagged} onClick={() => state.update(question.id, { ...state.drafts[question.id], flagged: !state.drafts[question.id].flagged })}><Flag aria-hidden className="size-4" />{t.examAnswering.flagged}</Button>
                </section>
                <ExamAnswerEditor draft={state.drafts[question.id]} question={question} paperId={attempt.paper.id} attemptId={attempt.id} busy={busy || confirming} onPhotoBusy={setPhotoBusy} onPenActivity={guard.onPenActivity} onChange={draft => state.update(question.id, draft)} />
            </div>
        </div>)}
        <footer className="fixed inset-x-0 bottom-0 z-20 flex justify-between gap-3 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
            <Button variant="outline" className="min-h-11" disabled={busy || state.current === 0} onClick={() => state.navigate(state.current - 1)}>{t.examAnswering.previous}</Button>
            <Button variant="outline" className="min-h-11" disabled={busy || state.current === items.length - 1} onClick={() => state.navigate(state.current + 1)}>{t.examAnswering.next}</Button>
        </footer>
        <SubmitPanel open={confirming} busy={state.busy} items={items} onOpenChange={setConfirming} onSelect={state.navigate} onSubmit={() => void state.submit()} />
    </main>;
}
