"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AttemptHistory } from "@/components/exam-attempt/attempt-history";
import { PageLoading } from "@/components/ui/page-loading";
import { ExamDetailHeader } from "@/components/exam/exam-detail-header";
import { ExamDetailActions } from "@/components/exam/exam-detail-actions";
import { ExamLayoutSettings } from "@/components/exam/exam-layout-settings";
import { ExamDetailQuestions } from "./exam-detail-questions";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/lib/page-title";
import { apiClient, ApiError } from "@/lib/api-client";
import { useRunningTask } from "@/lib/hooks/use-running-task";
import { confirmDialog, toast } from "@/lib/feedback";
import type { FigureAlign } from "@/lib/figure-scale";
import type { ExamPaperDetail } from "@/types/api";

const POLL_INTERVAL_MS = 3000;

export default function ExamDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { t, language } = useLanguage();
    const paperId = params.id as string;
    const [paper, setPaper] = useState<ExamPaperDetail | null>(null);
    usePageTitle(t.exam.title, paper?.title);
    const [notFound, setNotFound] = useState(false);
    const [settingsExpanded, setSettingsExpanded] = useState(false);
    const [starting, setStarting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [uniformPreview, setUniformPreview] = useState<{ scale: number | null; align: FigureAlign | null }>({ scale: null, align: null });

    // 重试失败题目：同一试卷同一时刻只允许一个生成任务；刷新后若任务仍在进行，禁用按钮
    const retryTarget = `exam-paper:${paperId}:generate`;
    const { running: retryRunning, refresh: refreshRetryTask } = useRunningTask(retryTarget);

    const load = useCallback(async () => {
        try {
            setPaper(await apiClient.get<ExamPaperDetail>(`/api/exams/${paperId}`));
        } catch {
            setNotFound(true);
        }
    }, [paperId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 数据请求：进入页面或条件变化时加载，请求前后更新加载状态和结果
        load();
    }, [load]);

    // 生成中时轮询进度
    useEffect(() => {
        if (paper?.status !== "generating") return;
        const timer = setTimeout(load, POLL_INTERVAL_MS);
        return () => clearTimeout(timer);
    }, [paper, load]);

    if (notFound) return <div className="p-8 text-center">{t.exam.notFound}</div>;
    if (!paper) return <PageLoading label={t.common.loading} />;

    const readyCount = paper.questions.filter((question) => question.status === "ready").length;
    const hasFailed = paper.questions.some((question) => question.status === "failed");
    const recordable = paper.questions.filter((question) => question.status === "ready" && question.errorItemId);

    const unfinished = paper.attempts?.find(attempt => attempt.status !== 'done');
    const continuing = unfinished?.kind === 'online' && unfinished.status === 'answering';
    const startRecording = async (kind: 'online' | 'photo' | 'manual' = 'manual') => {
        if (kind !== 'manual' && unfinished && (unfinished.kind !== kind || unfinished.status !== 'answering')) { setMessage(t.examAnswering.unfinished); return; }
        setStarting(true);
        try {
            const attempt = await apiClient.post<{ id: string; kind: string; status: string }>(`/api/exams/${paper.id}/attempts`, { kind });
            if (kind !== 'manual' && (attempt.kind !== kind || attempt.status !== 'answering')) { setMessage(t.examAnswering.unfinished); await load(); return; }
            router.push(`/exams/${paper.id}/attempts/${attempt.id}`);
        } catch { setMessage(t.examAttempt.networkError); }
        finally { setStarting(false); }
    };

    const retryFailed = async () => {
        try {
            await apiClient.post(`/api/exams/${paper.id}/retry`, { language });
        } catch (error) {
            if (error instanceof ApiError && error.status === 409 && (error.data as { code?: string })?.code === "TASK_ALREADY_RUNNING") {
                toast.info(t.errors.TASK_ALREADY_RUNNING);
                await refreshRetryTask();
            } else {
                throw error;
            }
        }
        await load();
    };

    const deletePaper = async () => {
        if (!(await confirmDialog(t.exam.deleteConfirm, { destructive: true }))) return;
        await apiClient.delete(`/api/exams/${paper.id}`);
        router.push("/exams");
    };

    const saveQuestionFigureScale = async (questionId: string, figureScale: number, figureAlign: FigureAlign) => {
        await apiClient.patch(`/api/exams/${paper.id}`, { questionId, figureScale, figureAlign });
        setPaper((prev) => (prev ? {
            ...prev,
            questions: prev.questions.map((question) => (question.id === questionId ? { ...question, figureScale, figureAlign } : question)),
        } : prev));
    };

    const saveUniformFigureScale = async (patch: { figureScale?: number; figureAlign?: FigureAlign }) => {
        await apiClient.patch(`/api/exams/${paper.id}`, patch);
        setPaper((prev) => (prev ? {
            ...prev,
            questions: prev.questions.map((question) => ({ ...question, ...patch })),
        } : prev));
    };

    const saveQuestionScore = async (questionId: string, score: number | null) => {
        await apiClient.patch(`/api/exams/${paper.id}`, { questionId, score });
        setPaper((prev) => (prev ? {
            ...prev,
            questions: prev.questions.map((question) => (question.id === questionId ? { ...question, score } : question)),
        } : prev));
    };

    const saveUniformScore = async (score: number | null) => {
        await apiClient.patch(`/api/exams/${paper.id}`, { score });
        setPaper((prev) => (prev ? {
            ...prev,
            questions: prev.questions.map((question) => ({ ...question, score })),
        } : prev));
    };

    const saveGroupByType = async (groupByType: boolean) => {
        await apiClient.patch(`/api/exams/${paper.id}`, { groupByType });
        setPaper((prev) => (prev ? { ...prev, groupByType } : prev));
    };

    return (
        <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <div className="space-y-6 pb-24">
                <ExamDetailHeader paper={paper} />

                <ExamDetailActions
                    paperId={paper.id}
                    readyCount={readyCount}
                    generating={paper.status === "generating"}
                    recordable={recordable.length > 0}
                    starting={starting}
                    continueLabel={continuing ? t.examAnswering.continue.replace('{answered}', String(unfinished.answeredCount)).replace('{total}', String(readyCount)) : undefined}
                    hasFailed={hasFailed}
                    retryRunning={!!retryRunning}
                    onStart={startRecording}
                    onRetry={retryFailed}
                    onDelete={deletePaper}
                />

                {paper.questions.length < paper.requestedCount && (
                    <p className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200">
                        {t.exam.fewerThanRequested.replaceAll("{actual}", String(paper.questions.length))}
                    </p>
                )}
                {message && unfinished && <Button asChild variant="outline" className="min-h-11"><Link href={`/exams/${paper.id}/attempts/${unfinished.id}`}>{t.examAnswering.openUnfinished}</Link></Button>}
                {message && <p className="rounded-md border p-3 text-sm">{message}</p>}

                <AttemptHistory paperId={paper.id} attempts={paper.attempts ?? []} />

                <ExamLayoutSettings
                    questions={paper.questions}
                    groupByType={paper.groupByType}
                    expanded={settingsExpanded}
                    onExpandedChange={setSettingsExpanded}
                    onPreviewChange={setUniformPreview}
                    onSaveFigureScale={saveUniformFigureScale}
                    onSaveScore={saveUniformScore}
                    onSaveGroupByType={saveGroupByType}
                />

                <ExamDetailQuestions
                    paperId={paper.id}
                    paperMode={paper.mode}
                    groupByType={paper.groupByType}
                    questions={paper.questions}
                    onRegenerated={load}
                    settingsExpanded={settingsExpanded}
                    uniformPreview={settingsExpanded ? uniformPreview : { scale: null, align: null }}
                    onSaveFigureScale={saveQuestionFigureScale}
                    onSaveScore={saveQuestionScore}
                />

            </div>
        </main>
    );
}
