"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { groupAttemptQuestions, manualAttemptDate } from "@/lib/exam/exam-attempt-view";
import type { AttemptGroup } from "@/lib/exam/exam-attempt-view";
import type { ExamAttemptAnswer, ExamAttemptDetail, PracticeResult } from "@/types/api";

export function useExamAttempt(paperId: string, attemptId: string, timeZone: string) {
    const [attempt, setAttempt] = useState<ExamAttemptDetail | null>(null);
    // 分组与题序只在载入或确认后取快照，逐题编辑时沿用，避免卡片移动。
    const [groups, setGroups] = useState<AttemptGroup[]>([]);
    const [editing, setEditing] = useState(false);
    const [takenAt, setTakenAt] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [pending, setPending] = useState<string[]>([]);
    // 同步锁阻止快速连点越过 React 状态更新；不同题仍可同时保存。
    const locks = useRef(new Set<string>());
    const actionLock = useRef(false);
    const base = `/api/exams/${paperId}/attempts/${attemptId}`;
    const load = useCallback(async () => {
        setError(false);
        try {
            const loaded = await apiClient.get<ExamAttemptDetail>(base);
            setAttempt(loaded);
            setGroups(groupAttemptQuestions(loaded));
        }
        catch { setError(true); }
    }, [base]);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 进入结果页时请求服务器作答数据。
        void load();
    }, [load]);

    const changeResult = async (questionId: string, finalResult: PracticeResult) => {
        if (!attempt || locks.current.has(questionId) || actionLock.current) return;
        const previous = attempt.answers.find(answer => answer.examQuestionId === questionId);
        const optimistic: ExamAttemptAnswer = { id: '', examQuestionId: questionId, answerText: null, answerImageUrl: null, recognizedAnswer: null, handMark: null, aiResult: null, aiReason: null, ...previous, finalResult };
        const replace = (answer?: ExamAttemptAnswer) => setAttempt(current => current ? {
            ...current, answers: [...current.answers.filter(item => item.examQuestionId !== questionId), ...(answer ? [answer] : [])],
        } : current);
        locks.current.add(questionId);
        setPending([...locks.current]);
        setError(false);
        replace(optimistic);
        try { replace(await apiClient.patch<ExamAttemptAnswer>(`${base}/answers/${questionId}`, { finalResult })); }
        catch { replace(previous); setError(true); }
        finally { locks.current.delete(questionId); setPending([...locks.current]); }
    };

    const confirm = async (date?: string) => {
        if (!attempt || actionLock.current || locks.current.size > 0) return;
        actionLock.current = true;
        setBusy(true);
        setError(false);
        try {
            await apiClient.post(`${base}/confirm`, date ? { takenAt: date } : {});
            // 确认已成功时立即只读；刷新失败仍显示已保存，重试可重新读取。
            const confirmed: ExamAttemptDetail = { ...attempt, status: 'done', submittedAt: date ?? attempt.submittedAt ?? new Date().toISOString() };
            setAttempt(confirmed);
            setGroups(groupAttemptQuestions(confirmed));
            setEditing(false);
            await load();
            setTakenAt(null);
        } catch { setError(true); }
        finally { actionLock.current = false; setBusy(false); }
    };

    const discard = async (): Promise<boolean> => {
        if (actionLock.current || locks.current.size > 0) return false;
        actionLock.current = true;
        setBusy(true);
        try { await apiClient.delete(base); return true; }
        catch { setError(true); return false; }
        finally { actionLock.current = false; setBusy(false); }
    };
    return { attempt, groups, editing, setEditing, takenAt: takenAt ?? (attempt ? manualAttemptDate(attempt, timeZone) : ''), setTakenAt, busy, pending, error, load, changeResult, confirm, discard };
}
