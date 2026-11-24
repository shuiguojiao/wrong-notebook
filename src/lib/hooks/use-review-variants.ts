"use client";

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import type { LastPractice } from '@/lib/last-practice';
import type { ReviewSessionItem } from '@/types/api';

export type GeneratedReviewVariant = LastPractice & { variantToken: string };

/** 当前题及其后最多两道变式题；结果只供本次固定队列使用。 */
export function useReviewVariants(items: ReviewSessionItem[] | null, index: number) {
    const { language } = useLanguage();
    const requests = useRef(new Map<string, AbortController>());
    const [cache, setCache] = useState<{ items: ReviewSessionItem[]; results: Map<string, GeneratedReviewVariant | null> }>();

    useEffect(() => {
        const active = requests.current;
        return () => {
            for (const controller of active.values()) controller.abort();
            active.clear();
        };
    }, [items]);

    useEffect(() => {
        if (!items) return;
        const upcoming = items.slice(index).filter(item => item.useVariant).slice(0, items[index]?.useVariant ? 3 : 2);
        for (const { id } of upcoming) {
            if (requests.current.has(id)) continue;
            const controller = new AbortController();
            requests.current.set(id, controller);
            const settle = (result: GeneratedReviewVariant | null) => {
                if (controller.signal.aborted) return;
                setCache(previous => {
                    const results = new Map(previous?.items === items ? previous.results : undefined);
                    results.set(id, result);
                    return { items, results };
                });
            };
            void apiClient.post<GeneratedReviewVariant>('/api/practice/generate', { errorItemId: id, language, mode: 'variant_review' },
                { signal: controller.signal, timeout: 20_000, quietAiErrors: true })
                .then(result => settle(result.variantToken && result.questionText?.trim() && result.answerText?.trim() ? result : null))
                .catch(() => settle(null));
        }
    }, [items, index, language]);

    return cache?.items === items ? cache.results : undefined;
}
