"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ClipboardCheck, Loader2, Printer, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AttemptHistory } from "@/components/exam-attempt/attempt-history";
import { PageLoading } from "@/components/ui/page-loading";
import { ExamDetailHeader } from "@/components/exam/exam-detail-header";
import { ExamFigureScaleBar } from "@/components/exam/exam-figure-scale-bar";
import { ExamDetailQuestions } from "./exam-detail-questions";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/lib/page-title";
import { apiClient, ApiError } from "@/lib/api-client";
import { useRunningTask } from "@/lib/hooks/use-running-task";
import type { FigureAlign } from "@/lib/figure-scale";
import type { ExamPaperDetail } from "@/types/api";
import { confirmDialog, toast } from "@/lib/feedback";

const POLL_INTERVAL_MS = 3000;

export default function ExamDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { t, language } = useLanguage();
    const paperId = params.id as string;
    const [paper, setPaper] = useState<ExamPaperDetail | null>(null);
    usePageTitle(t.exam.title, paper?.title);
    const [notFound, setNotFound] = useState(false);
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
    const figureQuestions = paper.questions.filter((question) => question.status === "ready" && Boolean(question.figureSvg));

    const unfinished = paper.attempts?.find(attempt => attempt.status !== 'done');
    const continuing = unfinished?.kind === 'online' && unfinished.status === 'answering';
    const startRecording = async (kind: 'online' | 'manual' = 'manual') => {
        if (kind === 'online' && unfinished && !continuing) { setMessage(t.examAnswering.unfinished); return; }
        setStarting(true);
        try {
            const attempt = await apiClient.post<{ id: string; kind: string; status: string }>(`/api/exams/${paper.id}/attempts`, { kind });
            if (kind === 'online' && (attempt.kind !== 'online' || attempt.status !== 'answering')) { setMessage(t.examAnswering.unfinished); await load(); return; }
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

                <div className="flex flex-wrap gap-2">
                    {readyCount > 0 && paper.status !== 'generating' && <Button className="min-h-11" disabled={starting} onClick={() => void startRecording('online')}>
                        {continuing ? t.examAnswering.continue.replace('{answered}', String(unfinished.answeredCount)).replace('{total}', String(readyCount)) : t.examAnswering.start}
                    </Button>}
                    <Link href={`/exams/${paper.id}/print`}>
                        <Button variant="outline" className="min-h-11" disabled={readyCount === 0}>
                            <Printer className="mr-2 h-4 w-4" />
                            {t.exam.print}
                        </Button>
                    </Link>
                    {recordable.length > 0 && (
                        <Button variant="outline" className="min-h-11" onClick={() => void startRecording()} disabled={starting}>
                            <ClipboardCheck className="mr-2 h-4 w-4" />
                            {t.examAttempt.manualEntry}
                        </Button>
                    )}
                    {hasFailed && paper.status !== "generating" && (
                        <Button variant="outline" className="min-h-11" onClick={retryFailed} disabled={!!retryRunning}>
                            {retryRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                            {retryRunning ? t.exam.questionPending : t.exam.retryFailed}
                        </Button>
                    )}
                    <Button variant="ghost" onClick={deletePaper} className="min-h-11 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 sm:ml-auto">
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t.exam.delete}
                    </Button>
                </div>

                {paper.questions.length < paper.requestedCount && (
                    <p className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200">
                        {t.exam.fewerThanRequested.replaceAll("{actual}", String(paper.questions.length))}
                    </p>
                )}
                {message && unfinished && <Button asChild variant="outline" className="min-h-11"><Link href={`/exams/${paper.id}/attempts/${unfinished.id}`}>{t.examAnswering.openUnfinished}</Link></Button>}
                {message && <p className="rounded-md border p-3 text-sm">{message}</p>}

                <AttemptHistory paperId={paper.id} attempts={paper.attempts ?? []} />

                {figureQuestions.length > 0 && (
                    <ExamFigureScaleBar
                        scales={figureQuestions.map((question) => question.figureScale)}
                        aligns={figureQuestions.map((question) => question.figureAlign)}
                        onPreviewChange={setUniformPreview}
                        onSave={saveUniformFigureScale}
                    />
                )}

                <ExamDetailQuestions
                    paperId={paper.id}
                    paperMode={paper.mode}
                    groupByType={paper.groupByType}
                    questions={paper.questions}
                    onRegenerated={load}
                    uniformPreview={uniformPreview}
                    onSaveFigureScale={saveQuestionFigureScale}
                    onSaveScore={saveQuestionScore}
                    onSaveUniformScore={saveUniformScore}
                    onSaveGroupByType={saveGroupByType}
                />

            </div>
        </main>
    );
}
