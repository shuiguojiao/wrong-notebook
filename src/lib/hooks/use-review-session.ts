"use client";

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/error-message';
import { completeReview, createReviewSnapshot, getReviewProgress } from '@/lib/review-session';
import type { ReviewOutcome } from '@/lib/review-session';
import type { ReviewSessionItem } from '@/types/api';

/** 开始时只请求一次快照，保存及跳过都仅推进这份固定队列。 */
export function useReviewSession() {
    const { t } = useLanguage();
    const [items, setItems] = useState<ReviewSessionItem[] | null>(null);
    const [generation, setGeneration] = useState(0);
    const [outcomes, setOutcomes] = useState<ReviewOutcome[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    async function start(subjectId: string, mode: 'today' | 'extra' = 'today') {
        if (loading) return;
        setLoading(true);
        setError(null);
        try {
            const query = new URLSearchParams({ format: 'ids', mode });
            if (subjectId) query.set('subjectId', subjectId);
            const data = await apiClient.get<{ items: ReviewSessionItem[] }>(`/api/review/due?${query}`);
            setGeneration(value => value + 1);
            setItems(createReviewSnapshot(data.items));
            setOutcomes([]);
        } catch (err) {
            setError(getApiErrorMessage(err) || t.review.loadFailed);
        } finally {
            setLoading(false);
        }
    }
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
    return { generation, undo, items, outcomes, loading, error, start, complete, ...getReviewProgress(items ?? [], outcomes) };
}
