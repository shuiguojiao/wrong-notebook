"use client";

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/error-message';
import { completeReview, createReviewSnapshot, getReviewProgress } from '@/lib/review-session';
import type { ReviewOutcome } from '@/lib/review-session';
import type { ReviewQueueResponse, ReviewSessionItem } from '@/types/api';

/** 开始时只请求一次快照，保存及跳过都仅推进这份固定队列。 */
export function useReviewSession() {
    const { t } = useLanguage();
    const [items, setItems] = useState<ReviewSessionItem[] | null>(null);
    const startLock = useRef(false);
    const [mode, setMode] = useState<'today' | 'extra'>('today');
    const [coversToday, setCoversToday] = useState(false);
    const [dayKey, setDayKey] = useState<string>();
    const [verified, setVerified] = useState<{ outcomes: ReviewOutcome[]; date: string } | null>(null);
    const [generation, setGeneration] = useState(0);
    const [outcomes, setOutcomes] = useState<ReviewOutcome[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    async function start(subjectId: string, mode: 'today' | 'extra' = 'today') {
        if (startLock.current) return;
        startLock.current = true;
        setLoading(true);
        setError(null);
        try {
            const query = new URLSearchParams({ format: 'ids', mode });
            if (subjectId) query.set('subjectId', subjectId);
            const [data, allToday] = await Promise.all([
                apiClient.get<Pick<ReviewQueueResponse, 'items'> & Partial<ReviewQueueResponse>>(`/api/review/due?${query}`),
                subjectId && mode === 'today'
                    ? apiClient.get<ReviewQueueResponse>('/api/review/due?format=overview').catch(() => null)
                    : Promise.resolve(null),
            ]);
            setGeneration(value => value + 1);
            const snapshot = createReviewSnapshot(data.items);
            setItems(mode === 'extra' ? snapshot.slice(0, 5) : snapshot);
            // 单科可能扣光全局额度，不能只看结束后的空队列就宣称其他科也已完成。
            setCoversToday(!subjectId || !!allToday && allToday.dayKey === data.dayKey
                && allToday.items.every(item => snapshot.some(entry => entry.id === item.id)));
            setMode(mode);
            setDayKey(data.dayKey);
            setVerified(null);
            setOutcomes([]);
        } catch (err) {
            setError(getApiErrorMessage(err) || t.review.loadFailed);
        } finally {
            startLock.current = false;
            setLoading(false);
        }
    }
    // 只在整组都已保存后核对全科队列；撤销、换组或跨日使旧核对结果失效。
    useEffect(() => {
        if (!coversToday || loading || mode !== 'today' || !dayKey || !items?.length || outcomes.length !== items.length || outcomes.some(outcome => outcome.result === 'skipped')) return;
        let cancelled = false;
        apiClient.get<ReviewQueueResponse>('/api/review/due?format=overview').then(data => {
            if (!cancelled && data.dayKey === dayKey && data.items.length === 0 && data.todayReviewed > 0) {
                setVerified({ outcomes, date: dayKey.slice(dayKey.lastIndexOf(':') + 1) });
            }
        }).catch(() => {
            // 核对失败时保留本次已保存的小结，不宣称当天任务已清空。
        });
        return () => { cancelled = true; };
    }, [coversToday, dayKey, items, loading, mode, outcomes]);
    function complete(outcome: ReviewOutcome) {
        setOutcomes(previous => completeReview(items ?? [], previous, outcome));
    }
    function undo(id: string) {
        setOutcomes(previous => {
            const index = previous.findIndex(outcome => outcome.id === id);
            // 跳过没有落库；撤销最近一次保存时，同时回退之后的跳过进度。
            return index >= 0 && previous.slice(index + 1).every(outcome => outcome.result === 'skipped')
                ? previous.slice(0, index) : previous;
        });
    }
    return { mode, completionDate: !loading && verified?.outcomes === outcomes ? verified.date : undefined, generation, undo, items, outcomes, loading, error, start, complete, ...getReviewProgress(items ?? [], outcomes) };
}
