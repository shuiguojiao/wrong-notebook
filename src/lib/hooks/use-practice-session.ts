"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient, ApiError } from "@/lib/api-client";
import { matchAnswer } from "@/lib/answer-match";
import { getApiErrorMessage } from "@/lib/error-message";
import { frontendLogger } from "@/lib/frontend-logger";
import { toast } from "@/lib/feedback";
import { useSubmitUndo } from "@/lib/hooks/use-submit-undo";
import { useRunningTask } from "@/lib/hooks/use-running-task";
import { useHandwrittenAnswer } from "@/lib/hooks/use-handwritten-answer";
import type { AnswerGradingResult, ParsedQuestion } from "@/lib/ai/types";
import type { LastPractice } from "@/lib/last-practice";
import type { AppConfig, PracticeResult } from "@/types/api";

type PracticeQuestion = ParsedQuestion & {
    practiceVersion: string;
    generatedAt: string;
    difficulty: PracticeDifficulty;
};

type CachedPractice = LastPractice & { practiceVersion: string };

function cachedQuestion(practice: CachedPractice): PracticeQuestion {
    return {
        ...practice,
        subject: (practice.subject || "其他") as ParsedQuestion["subject"],
        knowledgePoints: [], wrongAnswerText: "", mistakeAnalysis: "", mistakeStatus: "unknown", requiresImage: false,
    };
}

export type PracticeDifficulty = "easy" | "medium" | "hard" | "harder";

const DEFAULT_TIMEOUT = 180000;

/** AI 错误码对应的提示，未知错误用默认文案 */
const AI_ERROR_KEYS = [
    ['AI_CONNECTION_FAILED', 'aiConnectionFailed'],
    ['AI_RESPONSE_ERROR', 'aiResponseError'],
    ['AI_AUTH_ERROR', 'aiAuth'],
    ['AI_OUTPUT_TRUNCATED', 'AI_OUTPUT_TRUNCATED'],
    ['AI_UNKNOWN_ERROR', 'AI_UNKNOWN_ERROR'],
] as const;

/**
 * 举一反三练习的状态：读取上次生成的题目、生成新题、提交答案（本地比对或 AI 判题）、直接查看答案
 */
export function usePracticeSession(errorItemId: string | null) {
    const { t, language } = useLanguage();
    const handwriting = useHandwrittenAnswer();
    const undo = useSubmitUndo();

    const [question, setQuestion] = useState<PracticeQuestion | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAnswer, setShowAnswer] = useState(false);
    const [userAnswer, setUserAnswer] = useState("");
    const [notes, setNotes] = useState("");
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    // AI 判题中；判定依据与失败状态用于在结果中说明
    const [grading, setGrading] = useState(false);
    const [gradeReason, setGradeReason] = useState<string | null>(null);
    const [gradeFailed, setGradeFailed] = useState(false);
    const [difficulty, setDifficulty] = useState<PracticeDifficulty>("medium");
    // 生成当前题目时使用的难度（下拉框改动后不影响已生成题目的记录）
    const generatedDifficulty = question?.difficulty ?? "medium";
    // 每生成一道新题递增，用于重置结果卡片
    const [questionVersion, setQuestionVersion] = useState(0);
    const [config, setConfig] = useState<AppConfig | null>(null);
    // 当前题目的生成时间；读取暂存题目期间不显示生成按钮，避免闪烁
    const generatedAt = question?.generatedAt ?? null;
    const [loadingCached, setLoadingCached] = useState(true);

    useEffect(() => {
        apiClient.get<AppConfig>("/api/settings")
            .then(setConfig)
            .catch(err => frontendLogger.error('[Practice]', 'Failed to fetch config', { error: err }));
    }, []);

    // 进入页面时先读取该错题最近一次生成的题目，有则直接显示
    useEffect(() => {
        if (!errorItemId) return;
        let cancelled = false;
        apiClient.get<{ practice: CachedPractice | null }>(`/api/practice/generate?errorItemId=${encodeURIComponent(errorItemId)}`)
            .then(({ practice }) => {
                if (cancelled || !practice) return;
                setQuestion(prev => prev ?? cachedQuestion(practice));
                setDifficulty(practice.difficulty);
            })
            .catch(err => frontendLogger.warn('[Practice]', 'Failed to load last practice question', {
                error: err instanceof Error ? err.message : String(err),
            }))
            .finally(() => {
                if (!cancelled) setLoadingCached(false);
            });
        return () => { cancelled = true; };
    }, [errorItemId]);

    const timeout = config?.timeouts?.analyze || DEFAULT_TIMEOUT;

    // 按目标防重复：同一错题同一时刻只允许一个「举一反三」任务
    const target = errorItemId ? `error-item:${errorItemId}:practice` : null;
    const { running: taskRunning, refresh } = useRunningTask(target);
    // 任务结束后重新加载该错题最近一次生成的题目（结果已由服务端写入数据库）
    const wasRunning = useRef(false);
    useEffect(() => {
        if (!errorItemId) return;
        if (taskRunning) {
            wasRunning.current = true;
            return;
        }
        if (wasRunning.current) {
            wasRunning.current = false;
            apiClient.get<{ practice: CachedPractice | null }>(`/api/practice/generate?errorItemId=${encodeURIComponent(errorItemId)}`)
                .then(({ practice }) => {
                    if (!practice) return;
                    setQuestion(prev => prev ?? cachedQuestion(practice));
                    setDifficulty(practice.difficulty);
                })
                .catch(err => frontendLogger.warn('[Practice]', 'Failed to reload last practice question', { error: err }));
        }
    }, [taskRunning, errorItemId]);

    const generateQuestion = async () => {
        if (!errorItemId || loading || taskRunning || grading || handwriting.exporting) return;

        setLoading(true);
        setError(null);
        try {
            frontendLogger.info('[Practice]', 'Generating question', { timeout });
            const data = await apiClient.post<PracticeQuestion>("/api/practice/generate", {
                errorItemId,
                language,
                difficulty,
            }, { timeout, recoverable: true });
            undo.dismiss();
            setUserAnswer(""); setNotes(""); setIsSubmitted(false); setIsCorrect(null);
            setGradeReason(null); setGradeFailed(false); setShowAnswer(false); handwriting.resetInk();
            setQuestion({ ...data, difficulty });
            setQuestionVersion(v => v + 1);
        } catch (err) {
            if (err instanceof ApiError && err.status === 409 && (err.data as { code?: string })?.code === "TASK_ALREADY_RUNNING") {
                toast.info(t.errors.TASK_ALREADY_RUNNING);
                await refresh();
            } else {
                frontendLogger.error('[Practice]', 'Failed to generate practice question', { error: err });
                const msg = getApiErrorMessage(err) || "";
                const matched = AI_ERROR_KEYS.find(([code]) => msg.includes(code));
                const fallback = t.practice.errors?.default || "Failed to generate";
                setError((matched && t.errors?.[matched[1]]) || fallback);
            }
        } finally {
            setLoading(false);
        }
    };

    // 不要求过程且本地能确定答案一致时直接判对；需要论证或无法比对时交给 AI，失败时由用户选择结果
    const submitAnswer = async () => {
        if ((!userAnswer.trim() && !handwriting.ink.strokes.length) || !question || !errorItemId || isSubmitted || loading || taskRunning || grading || handwriting.exporting) return;
        const exported = await handwriting.prepareImage();
        if (!exported) return;

        const controller = undo.begin();
        setIsSubmitted(true);
        setShowAnswer(true);
        if (!exported.images.length && matchAnswer(userAnswer, question.answerText, question.questionText)) {
            setIsCorrect(true);
            setShowAnswer(true);
            return;
        }

        setGrading(true);
        try {
            const graded = await apiClient.post<AnswerGradingResult>("/api/practice/grade", {
                errorItemId,
                userAnswer,
                ...(exported.images.length ? { answerImages: exported.images } : {}),
                notes,
                practiceVersion: question.practiceVersion,
                language,
            }, { timeout, recoverable: true, signal: controller.signal });
            if (controller.signal.aborted) return;
            setIsCorrect(graded.correct);
            setGradeReason(graded.reason);
            handwriting.setRecognizedAnswer(graded.recognizedAnswer);
        } catch (err) {
            if (controller.signal.aborted) return;
            frontendLogger.warn('[Practice]', 'Failed to grade answer', { error: err });
            setIsCorrect(null);
            setGradeFailed(true);
            if (err instanceof ApiError && err.status === 409 && (err.data as { code?: string })?.code === "PRACTICE_CHANGED") {
                setError(t.practice.questionChanged);
            }
        } finally {
            if (!controller.signal.aborted) setGrading(false);
        }
    };

    // 不作答直接看答案，由用户自己判定结果
    const revealAnswer = async () => {
        if (isSubmitted || loading || taskRunning || grading || handwriting.exporting) return;
        if (!await handwriting.prepareImage()) return;
        setIsSubmitted(true);
        setIsCorrect(null);
        setShowAnswer(true);
    };

    const undoSubmit = () => {
        if (!undo.cancel()) return;
        setIsSubmitted(false); setShowAnswer(false); setIsCorrect(null);
        setGrading(false); setGradeReason(null); setGradeFailed(false); setError(null);
        handwriting.setRecognizedAnswer(undefined);
    };

    const suggestedResult: PracticeResult | null = isCorrect === null ? null : isCorrect ? "correct" : "wrong";

    return {
        question, loading: loading || !!taskRunning, loadingCached, error, generatedAt,
        difficulty, setDifficulty, generatedDifficulty, questionVersion,
        userAnswer, setUserAnswer, notes, setNotes,
        ...handwriting, isSubmitted, isCorrect, grading: grading || handwriting.exporting, gradeReason, gradeFailed, showAnswer, suggestedResult,
        generateQuestion, submitAnswer, revealAnswer,
        undoSubmit, canUndoSubmit: undo.canUndo, dismissSubmitUndo: undo.dismiss,
    };
}
