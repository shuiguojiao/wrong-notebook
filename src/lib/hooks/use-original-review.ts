"use client";

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubmitUndo } from '@/lib/hooks/use-submit-undo';
import { useReviewTimer } from '@/lib/hooks/use-review-timer';
import { useHandwrittenAnswer } from '@/lib/hooks/use-handwritten-answer';
import { matchAnswer } from '@/lib/answer-match';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/error-message';
import type { AnswerGradingResult } from '@/lib/ai/types';
import type { AppConfig, ErrorItem } from '@/types/api';

/**
 * 仅加载当前原题；不会生成变式题或为下一题消耗 AI 配额。
 * 提交后立即进入对照界面，AI 判题在后台进行，结果返回后再更新建议，学生无需等待。
 * 纯文字作答且本地能确定与标准答案一致时直接判对，不调用 AI、不消耗配额。
 */
export function useOriginalReview(id: string, active = true) {
    const { t, language } = useLanguage();
    const handwriting = useHandwrittenAnswer();
    const undo = useSubmitUndo();
    const [item, setItem] = useState<ErrorItem | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    const [userAnswer, setUserAnswer] = useState('');
    const [notes, setNotes] = useState('');
    const [grading, setGrading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [graded, setGraded] = useState<AnswerGradingResult | null>(null);
    const [gradeFailed, setGradeFailed] = useState(false);
    const [localMatched, setLocalMatched] = useState(false);
    const [durationSec, setDurationSec] = useState(0);
    const timer = useReviewTimer(active && !!item && !submitted);
    const [timeout, setGradeTimeout] = useState(180000);

    useEffect(() => {
        let cancelled = false;
        apiClient.get<ErrorItem>(`/api/error-items/${encodeURIComponent(id)}`)
            .then(value => { if (!cancelled) { setItem(value); setError(null); } })
            .catch(err => { if (!cancelled) setError(getApiErrorMessage(err) || t.review.loadFailed); });
        return () => { cancelled = true; };
    }, [id, retry, t.review.loadFailed]);

    useEffect(() => {
        let cancelled = false;
        apiClient.get<AppConfig>('/api/settings')
            .then(config => { if (!cancelled) setGradeTimeout(config.timeouts?.analyze || 180000); })
            .catch(() => { /* 设置读取失败时沿用默认超时，不阻塞原题复习。 */ });
        return () => { cancelled = true; };
    }, []);

    async function submit() {
        if ((!userAnswer.trim() && !handwriting.ink.strokes.length) || grading || handwriting.exporting || submitted || !item) return;
        const duration = timer.pause();
        const exported = await handwriting.prepareImage();
        if (!exported) { timer.resume(); return; }
        setDurationSec(duration);
        const controller = undo.begin();
        setSubmitted(true);
        if (!exported.image && matchAnswer(userAnswer, item.answerText ?? '', item.questionText || item.ocrText || '')) {
            setLocalMatched(true);
            setGraded({ correct: true, reason: '' });
            return;
        }
        setGrading(true);
        try {
            const result = await apiClient.post<AnswerGradingResult>('/api/practice/grade', {
                mode: 'original', errorItemId: id, userAnswer, notes, language, answerImage: exported.image,
            }, { recoverable: true, timeout, signal: controller.signal });
            if (controller.signal.aborted) return;
            setGraded(result);
            handwriting.setRecognizedAnswer(result.recognizedAnswer);
        } catch {
            if (!controller.signal.aborted) setGradeFailed(true);
        } finally {
            if (!controller.signal.aborted) setGrading(false);
        }
    }

    function undoSubmit() {
        if (!undo.cancel()) return;
        setSubmitted(false); setGrading(false); setGraded(null);
        setGradeFailed(false); setLocalMatched(false);
        handwriting.setRecognizedAnswer(undefined);
        timer.resume();
    }

    return { canUndoSubmit: undo.canUndo, undoSubmit, dismissSubmitUndo: undo.dismiss, item, error, retry: () => setRetry(value => value + 1), userAnswer, setUserAnswer, notes, setNotes,
        ...handwriting, durationSec, grading, submitted, graded, localMatched, gradeFailed, submit };
}
