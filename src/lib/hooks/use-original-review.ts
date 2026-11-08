"use client";

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/error-message';
import type { AppConfig, ErrorItem } from '@/types/api';

/** 仅加载当前原题；不会生成变式题或为下一题消耗 AI 配额。 */
export function useOriginalReview(id: string) {
    const { t, language } = useLanguage();
    const [item, setItem] = useState<ErrorItem | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    const [userAnswer, setUserAnswer] = useState('');
    const [notes, setNotes] = useState('');
    const [grading, setGrading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [graded, setGraded] = useState<{ correct: boolean; reason: string } | null>(null);
    const [gradeFailed, setGradeFailed] = useState(false);
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
        if (!userAnswer.trim() || grading || submitted || !item) return;
        setGrading(true);
        setSubmitted(true);
        try {
            setGraded(await apiClient.post('/api/practice/grade', {
                mode: 'original', errorItemId: id, userAnswer, notes, language,
            }, { recoverable: true, timeout }));
        } catch {
            setGradeFailed(true);
        } finally {
            setGrading(false);
        }
    }

    return { item, error, retry: () => setRetry(value => value + 1), userAnswer, setUserAnswer, notes, setNotes,
        grading, submitted, graded, gradeFailed, submit };
}
