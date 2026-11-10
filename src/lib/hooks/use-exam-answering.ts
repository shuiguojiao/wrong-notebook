"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { ExamSaveStatus } from '@/lib/exam/exam-autosave';
import { ExamAutosave } from '@/lib/exam/exam-autosave';
import { examDraftKey, examDraftStorage, initialExamDraft } from '@/lib/exam/exam-answering-draft';
import type { ExamAnswerDraft, StoredExamDraft } from '@/lib/exam/exam-answering-draft';
import { prepareAnswerImages } from '@/lib/handwriting/prepare-answer';
import { useReviewTimer } from '@/lib/hooks/use-review-timer';
import type { ExamAttemptDetail } from '@/types/api';

export function useExamAnswering(attempt: ExamAttemptDetail, onSubmitted: () => Promise<void>) {
    const [ready, setReady] = useState(false);
    const [snapshot, setSnapshot] = useState<{ drafts: Record<string, ExamAnswerDraft>; status: ExamSaveStatus }>({ drafts: {}, status: 'saved' });
    const [current, setCurrent] = useState(0);
    const [visited, setVisited] = useState(new Set([0]));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [draftError, setDraftError] = useState(false);
    const [imageError, setImageError] = useState<{ questionId: string; key: 'tooManyImages' | 'exportFailed' } | null>(null);
    const [seconds, setSeconds] = useState(attempt.durationSec ?? 0);
    const [timerHidden, setTimerHidden] = useState(false);
    const timer = useReviewTimer(ready, attempt.durationSec ?? 0);
    const durationOffset = useRef(0);
    const { elapsed } = timer;
    const duration = useCallback(() => elapsed() + durationOffset.current, [elapsed]);
    const durationRef = useRef(duration);
    const saver = useRef<ExamAutosave | null>(null);
    const action = useRef(false);
    const base = `/api/exams/${attempt.paper.id}/attempts/${attempt.id}`;
    const [questions] = useState(() => [...attempt.paper.questions].sort((a, b) => (a.displayNumber ?? a.order) - (b.displayNumber ?? b.order)));
    useEffect(() => {
        durationRef.current = duration;
        const controller = new ExamAutosave({
            duration: () => durationRef.current(), online: () => navigator.onLine,
            notify: () => setSnapshot({ drafts: { ...controller.drafts }, status: controller.status }),
            persist: async (id, value) => {
                try { await examDraftStorage(examDraftKey(attempt.id, id), { value }); setDraftError(false); }
                catch (error) { setDraftError(true); throw error; }
            },
            send: async (id, draft, durationSec) => {
                let prepared: Awaited<ReturnType<typeof prepareAnswerImages>>;
                try { prepared = await prepareAnswerImages(draft.ink, draft.photos); }
                catch (error) {
                    setImageError({ questionId: id, key: error instanceof Error && error.message === 'TOO_MANY_ANSWER_IMAGES' ? 'tooManyImages' : 'exportFailed' });
                    throw error;
                }
                setImageError(current => current?.questionId === id ? null : current);
                const { images, displayImage } = prepared;
                await apiClient.put(`${base}/answers/${id}`, {
                    answerText: draft.text, flagged: draft.flagged, durationSec,
                    // 换设备时保留服务端图片，只有明确清空后才发送 null。
                    ...(!draft.serverImage || images.length ? { answerImage: displayImage ?? null, answerImages: images } : {}),
                });
            },
        });
        saver.current = controller;
        let active = true;
        void (async () => {
            let localDuration = attempt.durationSec ?? 0;
            for (const question of questions) {
                let saved: StoredExamDraft | undefined;
                try { saved = await examDraftStorage<StoredExamDraft>(examDraftKey(attempt.id, question.id)); }
                catch { if (active) setDraftError(true); }
                if (!active) return;
                const answer = attempt.answers.find(answer => answer.examQuestionId === question.id);
                controller.restore(question.id, saved?.draft ?? initialExamDraft(answer), saved?.dirty);
                localDuration = Math.max(localDuration, saved?.durationSec ?? 0);
            }
            durationOffset.current = Math.max(0, localDuration - (attempt.durationSec ?? 0));
            try { setTimerHidden(localStorage.getItem('exam-timer-hidden') === 'true'); } catch { /* 本机偏好不可用时仍可作答。 */ }
            setReady(true); setSnapshot({ drafts: { ...controller.drafts }, status: controller.status });
            if (controller.pending) void controller.flush();
        })();
        const hide = () => {
            if (!document.hidden) return;
            const first = questions[0]?.id;
            if (first && controller.drafts[first]) controller.update(first, controller.drafts[first]);
            void controller.flush();
        };
        const online = () => { void controller.flush(); };
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (controller.pending) { event.preventDefault(); event.returnValue = ''; }
        };
        document.addEventListener('visibilitychange', hide);
        window.addEventListener('online', online);
        window.addEventListener('beforeunload', beforeUnload);
        return () => {
            active = false; controller.dispose();
            document.removeEventListener('visibilitychange', hide);
            window.removeEventListener('online', online);
            window.removeEventListener('beforeunload', beforeUnload);
        };
        // 作答期间的服务器快照固定，避免刷新结果时重建草稿与保存队列。
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅切换作答 ID 时初始化。
    }, [attempt.id, base]);
    useEffect(() => {
        const interval = setInterval(() => setSeconds(duration()), 1000);
        return () => clearInterval(interval);
    }, [duration]);
    const navigate = useCallback((index: number) => {
        if (action.current || index < 0 || index >= questions.length) return;
        const controller = saver.current;
        const previous = questions[current]?.id;
        if (previous && controller?.drafts[previous]) controller.update(previous, controller.drafts[previous]);
        void controller?.flush();
        setCurrent(index); setVisited(value => new Set([...value, index]));
    }, [questions, current]);
    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            const target = event.target instanceof HTMLElement ? event.target : document.activeElement instanceof HTMLElement ? document.activeElement : null;
            if (busy || event.defaultPrevented || target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],dialog[aria-modal="true"]') || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); navigate(current + (event.key === 'ArrowRight' ? 1 : -1)); }
        };
        window.addEventListener('keydown', keydown);
        return () => window.removeEventListener('keydown', keydown);
    }, [current, navigate, busy]);
    const flush = async () => {
        if (action.current) return false;
        action.current = true; setBusy(true); setError(false);
        // 即使没有改答案，退出时也同步最新累计用时。
        const controller = saver.current;
        if (controller && questions[current]) controller.update(questions[current].id, controller.drafts[questions[current].id]);
        const success = await controller?.flush() ?? false;
        action.current = false; setBusy(false); setError(!success);
        return success;
    };
    const submit = async () => {
        if (action.current || !await flush()) return;
        action.current = true; setBusy(true);
        try {
            await apiClient.post(`${base}/submit`, { durationSec: duration() });
            timer.pause();
            await Promise.all(questions.map(question => examDraftStorage(examDraftKey(attempt.id, question.id), { value: null }).catch(() => undefined)));
            await onSubmitted();
        } catch { setError(true); await onSubmitted(); }
        finally { action.current = false; setBusy(false); }
    };
    return {
        ready, current, visited, questions, busy, error, draftError, imageError, seconds, timerHidden,
        drafts: snapshot.drafts, status: snapshot.status,
        update: (id: string, draft: ExamAnswerDraft) => saver.current?.update(id, draft), navigate, flush, submit,
        saveForExit: async () => await flush() || await saver.current?.persistLocal() || false,
        toggleTimer: () => { setTimerHidden(!timerHidden); try { localStorage.setItem('exam-timer-hidden', String(!timerHidden)); } catch { /* 本机偏好不可用。 */ } },
    };
}
