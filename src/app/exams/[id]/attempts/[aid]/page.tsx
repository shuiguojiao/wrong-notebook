"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ExamAnswering } from '@/components/exam-attempt/exam-answering';
import { GradingProgress } from '@/components/exam-attempt/grading-progress';
import { useReleaseFocusShell } from '@/contexts/FocusShellContext';
import { AttemptQuestionGroups } from "@/components/exam-attempt/attempt-question-groups";
import { ProgressStamp } from "@/components/student/progress-stamp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoading } from "@/components/ui/page-loading";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import { formatDateTime } from "@/lib/date-time";
import { canEditAttempt, manualTakenAt, summarizeAttempt } from "@/lib/exam/exam-attempt-view";
import { formatExamScore } from "@/lib/exam/exam-score";
import { confirmDialog } from "@/lib/feedback";
import { useExamAttempt } from "@/lib/hooks/use-exam-attempt";
import { usePageTitle } from "@/lib/page-title";

export default function ExamAttemptPage() {
    const { id, aid } = useParams<{ id: string; aid: string }>();
    const router = useRouter();
    const { t } = useLanguage();
    const { timeZone } = useTimeZone();
    const state = useExamAttempt(id, aid, timeZone);
    const { attempt } = state;
    useReleaseFocusShell((!attempt && state.error) || attempt?.status === 'reviewing' || attempt?.status === 'done');
    usePageTitle(t.examAttempt.results, attempt?.paper.title);
    const back = (
        <Button asChild variant="outline" className="min-h-11">
            <Link href={`/exams/${id}`}>{t.examAttempt.back}</Link>
        </Button>
    );
    const error = state.error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border p-4">
            <p>{t.examAttempt.networkError}</p>
            <Button variant="outline" className="min-h-11" disabled={state.busy || state.pending.length > 0} onClick={() => void state.load()}>
                {t.review.retry}
            </Button>
        </div>
    );
    if (!attempt) return (
        <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-8">
            {state.error ? <>{error}{back}</> : <PageLoading label={t.common.loading} />}
        </main>
    );
    if (attempt.status === 'answering') return <ExamAnswering attempt={attempt} onSubmitted={state.load} />;
    if (attempt.status === 'grading') return <GradingProgress attempt={attempt} error={state.error} onRetry={() => void state.load()} />;
    const editable = canEditAttempt(attempt, state.editing);
    const stats = summarizeAttempt(attempt);
    const date = manualTakenAt(state.takenAt, timeZone);
    const dateInvalid = attempt.kind === 'manual' && !date;
    const dateLabel = formatDateTime(attempt.submittedAt ?? attempt.startedAt, t.detail.reviewDateFormat, timeZone);
    const discard = async () => {
        if (await confirmDialog(t.examAttempt.discardConfirm, { destructive: true }) && await state.discard()) router.push(`/exams/${id}`);
    };
    const locateUnjudged = () => {
        const target = document.getElementById(`question-${stats.firstUnjudged}`);
        target?.scrollIntoView({ block: 'center' });
        target?.focus({ preventScroll: true });
    };

    return (
        <main className="mx-auto min-h-screen max-w-6xl space-y-6 px-4 pt-6 pb-52 md:px-8 md:pt-8">
            <header className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {back}
                    {attempt.status === 'done' && !editable && (
                        <Button variant="outline" className="min-h-11" onClick={() => state.setEditing(true)}>{t.examAttempt.edit}</Button>
                    )}
                </div>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                        <h1 className="break-words text-xl font-bold sm:text-2xl">{attempt.paper.title}</h1>
                        <p className="text-sm text-muted-foreground">{t.exam.attemptLabel.replace('{n}', String(attempt.number))} · {dateLabel}</p>
                        {attempt.durationSec !== null && (
                            <p className="text-sm text-muted-foreground">
                                {(attempt.durationSec < 60 ? t.examAttempt.durationSeconds : t.examAttempt.duration).replace('{minutes}', String(Math.floor(attempt.durationSec / 60))).replace('{seconds}', String(attempt.durationSec % 60))}
                            </p>
                        )}
                    </div>
                    {attempt.status === 'done' && !editable && <ProgressStamp variant="done" date={dateLabel} className="shrink-0" />}
                </div>
                {(
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-lg font-semibold" aria-live="polite">
                        <p>{t.examAttempt.stats.replace('{correct}', String(stats.correct)).replace('{total}', String(stats.total))}</p>
                        {stats.score && <p>{t.examAttempt.score.replace('{earned}', formatExamScore(stats.score.earned)).replace('{total}', formatExamScore(stats.score.total))}</p>}
                    </div>
                )}
                {editable && attempt.kind === 'manual' && (
                    <div className="space-y-2">
                        <label htmlFor="exam-taken-at" className="block text-sm font-medium">{t.exam.takenAt}</label>
                        <Input
                            id="exam-taken-at" type="date" className="min-h-11 w-full sm:w-52"
                            max={formatDateTime(new Date(), 'yyyy-MM-dd', timeZone)} value={state.takenAt}
                            disabled={state.busy} onChange={event => state.setTakenAt(event.target.value)}
                            aria-invalid={!!dateInvalid} aria-describedby={dateInvalid ? 'date-hint' : undefined}
                        />
                        {dateInvalid && <p id="date-hint" className="text-sm text-destructive">{t.examAttempt.dateHint}</p>}
                    </div>
                )}
            </header>
            {error}
            {attempt.gradingNotice && <p role="status" className="rounded-md border p-4">{attempt.gradingNotice === 'AI_DAILY_LIMIT_EXCEEDED' ? t.examAnswering.quotaUsed : attempt.gradingNotice === 'AI_CONSENT_REQUIRED' ? t.examAnswering.consentRequired : t.examAnswering.aiUnavailable}</p>}
            {(
                <AttemptQuestionGroups
                    attempt={attempt} groups={state.groups} editable={editable} busy={state.busy} pending={state.pending}
                    onRegrade={questionId => void state.regrade(questionId)}
                    onChange={(questionId, result) => void state.changeResult(questionId, result)}
                />
            )}
            {editable && (
                <footer className="fixed inset-x-0 left-[var(--student-sidebar-width,0px)] bottom-[var(--student-nav-height,0px)] z-30 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
                    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2">
                        {attempt.status === 'reviewing' && (
                            <Button variant="ghost" className="min-h-11 mr-auto text-destructive" disabled={state.busy || state.pending.length > 0} onClick={() => void discard()}>
                                {t.examAttempt.discard}
                            </Button>
                        )}
                        {stats.remaining > 0 && (
                            <Button variant="ghost" className="min-h-11" onClick={locateUnjudged}>
                                {t.examAttempt.remaining.replace('{count}', String(stats.remaining))}
                            </Button>
                        )}
                        <Button
                            className="min-h-11"
                            disabled={state.busy || state.pending.length > 0 || stats.remaining > 0 || !!dateInvalid}
                            onClick={() => void state.confirm(attempt.kind === 'manual' ? date ?? undefined : undefined)}
                        >
                            {state.busy ? t.common.progress.saving : t.examAttempt.confirm}
                        </Button>
                    </div>
                </footer>
            )}
        </main>
    );
}
