"use client";

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/error-message';
import { completeReview, createReviewSnapshot, getReviewProgress } from '@/lib/review-session';
import type { ReviewLimit, ReviewOutcome } from '@/lib/review-session';
import type { ReviewSessionItem } from '@/types/api';

/** 开始时只请求一次快照，保存及跳过都仅推进这份固定队列。 */
export function useReviewSession() {
    const { t } = useLanguage();
    const [items, setItems] = useState<ReviewSessionItem[] | null>(null);
    const [outcomes, setOutcomes] = useState<ReviewOutcome[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    async function start(subjectId: string, limit: ReviewLimit) {
        if (loading || items) return;
        setLoading(true);
        setError(null);
        try {
            const query = new URLSearchParams({ format: 'ids', limit });
            if (subjectId) query.set('subjectId', subjectId);
            const data = await apiClient.get<{ items: ReviewSessionItem[] }>(`/api/review/due?${query}`);
            setItems(createReviewSnapshot(data.items, limit));
        } catch (err) {
            setError(getApiErrorMessage(err) || t.review.loadFailed);
        } finally {
            setLoading(false);
        }
    }
    function complete(outcome: ReviewOutcome) {
        setOutcomes(previous => completeReview(items ?? [], previous, outcome));
    }
    return { items, outcomes, loading, error, start, complete, ...getReviewProgress(items ?? [], outcomes) };
}
