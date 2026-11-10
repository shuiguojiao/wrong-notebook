"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AnswerSubmitButton } from "@/components/handwriting/answer-submit-button";
import { SubmitUndoNotice } from "@/components/handwriting/submit-undo-notice";
import { AnswerInput } from "@/components/handwriting/answer-input";
import { RecognizedAnswer } from "@/components/handwriting/recognized-answer";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PageExits } from "@/components/page-exits";
import { PracticeResultCard } from "@/components/practice-result-card";
import { SourceThumb } from "@/components/question/source-thumb";
import { QuestionFigure } from "@/components/question-figure";
import { DifficultyPicker, DifficultySelect } from "@/components/practice/difficulty-picker";
import { GenerateButton } from "@/components/practice/generate-button";
import { PracticeFeedback } from "@/components/practice/practice-feedback";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/lib/page-title";
import { useInkGuard } from "@/lib/hooks/use-ink-guard";
import { usePracticeSession } from "@/lib/hooks/use-practice-session";

import type { PracticeRecordResponse } from "@/types/api";

interface PracticeSessionProps {
    errorItemId: string | null;
    embedded?: boolean;
    onSaved?: (record: PracticeRecordResponse) => void;
    onBusyChange?: (busy: boolean) => void;
}

export function PracticeSession({ errorItemId, embedded = false, onSaved, onBusyChange }: PracticeSessionProps) {
    const router = useRouter();
    const { t, language } = useLanguage();
    usePageTitle(embedded ? t.review.sessionTitle : t.practice.title);
    const session = usePracticeSession(errorItemId);
    const guard = useInkGuard();
    const { question, loading } = session;
    const [saving, setSaving] = useState(false);
    const [finished, setFinished] = useState(false);
    const busy = loading || session.grading || session.photoBusy || saving;
    useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

    const submitButton = (mobile = false) => <AnswerSubmitButton guard={guard} onSubmit={session.submitAnswer} mobile={mobile}
        disabled={session.isSubmitted || busy || (!session.userAnswer.trim() && !session.ink.strokes.length && !session.photos.length)}
        label={session.exporting ? t.common.loading : t.app.submitAnswer} />;

    if (!errorItemId) {
        return <section className="mx-auto max-w-xl space-y-4 rounded-xl border bg-card p-6 text-center">
            <h1 className="text-xl font-semibold">{t.practice.title}</h1>
            <p className="text-muted-foreground">{t.practice.entryHint.replace("{action}", t.student.trySimilar)}</p>
            <PageExits />
        </section>;
    }

    return (
        <div className={`max-w-7xl mx-auto space-y-8 ${question && !session.isSubmitted ? "practice-answering" : ""}`}>
            {!embedded && <div className="mb-4 flex justify-between items-center">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t.common?.back || "Back"}
                </Button>
            </div>}
            <div className="text-center space-y-4">
                {embedded ? <h2 className="text-xl font-bold">{t.practice.title}</h2> : <h1 className="text-3xl font-bold">{t.practice.title}</h1>}
                <p className="text-muted-foreground">
                    {t.practice.subtitle}
                </p>

                {session.error && (
                    <div className="relative rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive" role="alert">
                        <strong className="font-bold">{t.common?.error || "Error"}: </strong>
                        <span className="block whitespace-pre-wrap"> {session.error}</span>
                    </div>
                )}

                {/* 出错时才给出口，平时不打扰练习 */}
                {(session.error || session.gradeFailed || session.exportError) && <PageExits />}

                {session.loadingCached && !question && (
                    <div className="flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}

                {!question && !session.loadingCached && (
                    <div className="flex flex-col items-center gap-4">
                        <DifficultyPicker value={session.difficulty} onChange={session.setDifficulty} />
                        <GenerateButton loading={loading} onClick={session.generateQuestion} />
                    </div>
                )}
            </div>

            {question && (
                <div className="space-y-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-500">
                    <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                        <Card className="min-w-0 border-primary/50 shadow-lg lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto">
                            <CardHeader>
                                <CardTitle className="flex flex-wrap justify-between items-center gap-3">
                                    <span>{t.app.practiceProblem}</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <DifficultySelect value={session.difficulty} onChange={session.setDifficulty} disabled={busy || finished} />
                                        <GenerateButton loading={loading} disabled={busy || finished} onClick={session.generateQuestion} regenerate />
                                    </div>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {session.generatedAt && (
                                    <p className="mb-3 text-xs text-muted-foreground">
                                        {(t.practice.lastGeneratedAt || "Generated at {time}").replace("{time}", new Date(session.generatedAt).toLocaleString(language === "zh" ? "zh-CN" : "en-US"))}
                                    </p>
                                )}
                                <MarkdownRenderer content={question.questionText} className="font-medium" />
                                <QuestionFigure svg={question.figureSvg} />
                            </CardContent>
                        </Card>

                        <Card className="min-w-0 border-blue-200">
                            <CardHeader>
                                <CardTitle className="text-blue-600">
                                    {t.app.yourAnswer || "Your Answer"}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-1 flex-col gap-4">
                                <AnswerInput photos={session.photos} onPhotosChange={session.setPhotos} onPhotoBusyChange={session.setPhotoBusy}
                    mode={session.answerMode} onModeChange={session.setAnswerMode} topAction={!session.isSubmitted && submitButton()} onPenActivity={guard.onPenActivity} key={session.questionVersion} id="practice-answer" value={session.userAnswer} onChange={session.setUserAnswer}
                                    history={session.ink} onInkChange={session.setInk} readOnly={session.isSubmitted || busy} error={session.exportError} />
                                <Textarea
                                    aria-label={t.review.notes}
                                    placeholder={t.app.notesPlaceholder || "Record your thinking process (optional)..."}
                                    value={session.notes}
                                    onChange={(e) => session.setNotes(e.target.value)}
                                    disabled={session.isSubmitted || busy}
                                    maxLength={20000}
                                    rows={3}
                                />
                            </CardContent>
                        </Card>

                    </div>
                    {session.isSubmitted && session.answerImage && <SourceThumb src={session.answerImage} alt={t.handwriting.answerImage} />}
                    {session.isSubmitted && session.unreadable && !saving && !finished && <Button type="button" variant="outline" className="min-h-11" onClick={session.retakePhoto}>{t.review.retakePhoto}</Button>}
                    <RecognizedAnswer text={session.recognizedAnswer} />
                    {!session.isSubmitted && <div className="practice-submit-mobile fixed inset-x-0 bottom-[var(--student-nav-height,0px)] z-30 bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
                        {submitButton(true)}
                    </div>}
                    {session.canUndoSubmit && !saving && <SubmitUndoNotice onUndo={session.undoSubmit} />}
                    <PracticeFeedback hideSubmit
                        isSubmitted={session.isSubmitted}
                        grading={session.grading}
                        busy={busy}
                        isCorrect={session.isCorrect}
                        gradeFailed={session.gradeFailed}
                        gradeReason={session.gradeReason}
                        notes={session.notes}
                        canSubmit={!!session.userAnswer.trim() || !!session.ink.strokes.length || !!session.photos.length}
                        onSubmit={session.submitAnswer}
                        onReveal={session.revealAnswer}
                    />

                    {session.showAnswer && (
                        <div className="space-y-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
                            {!session.grading && <PracticeResultCard
                                key={session.questionVersion}
                                onSaved={onSaved ? (record) => { setFinished(true); onSaved(record); } : undefined}
                                onBusyChange={value => { if (value) session.dismissSubmitUndo(); setSaving(value); }}
                                errorItemId={errorItemId}
                                suggested={session.suggestedResult}
                                question={question}
                                difficulty={session.generatedDifficulty}
                                userAnswer={session.userAnswer}
                                answerImage={session.answerImage}
                                recognizedAnswer={session.recognizedAnswer}
                                notes={session.notes}
                                gradeReason={session.gradeReason}
                            />}
                            <Card className="bg-muted/50">
                                <CardHeader>
                                    <CardTitle className="text-green-600">{t.practice.correctAnswer}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <MarkdownRenderer content={question.answerText} className="font-bold" />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>{t.practice.detailedAnalysis}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <MarkdownRenderer content={question.analysis} />
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

