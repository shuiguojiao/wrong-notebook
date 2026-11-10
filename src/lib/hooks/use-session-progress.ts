"use client";

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { compareSessionProgress } from '@/lib/student-progress';
import type { StudentProgress } from '@/lib/student-progress';
import type { ReviewOutcome } from '@/lib/review-session';

export interface SessionProgress {
    mastered: number | null;
    newStickers: StudentProgress['stickers'];
    streak: number;
}

/** 快照仅保存在当前会话内；旧请求晚到不能覆盖换组或撤销后的结果。 */
export function useSessionProgress(outcomes: ReviewOutcome[], finished: boolean) {
    const [before, setBefore] = useState<StudentProgress | null>(null);
    const [result, setResult] = useState<{ outcomes: ReviewOutcome[]; before: StudentProgress; progress: SessionProgress } | null>(null);
    async function capture() {
        setBefore(null);
        try {
            const data = await apiClient.get<StudentProgress>('/api/student-progress');
            setBefore(data);
        } catch {
            // 进度取数失败不阻断复习，收工时保留未知值。
        }
    }
    useEffect(() => {
        if (!finished || !before) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const ids = outcomes.filter(outcome => outcome.result !== 'skipped').map(outcome => outcome.id);
        async function read(attempt: number) {
            try {
                const after = await apiClient.get<StudentProgress>('/api/student-progress');
                if (cancelled) return;
                const comparison = compareSessionProgress(before!, after, ids);
                setResult({ outcomes, before: before!, progress: { ...comparison, streak: after.streak } });
                // 保存会异步评估掌握概率，短暂等待后重读；仍未知则不补发奖励。
                if (comparison.mastered === null && attempt < 3) timer = setTimeout(() => void read(attempt + 1), 1000);
            } catch {
                // 请求失败不冒充零掌握或零贴纸。
            }
        }
        void read(0);
        return () => { cancelled = true; if (timer) clearTimeout(timer); };
    }, [before, finished, outcomes]);
    return { capture, progress: result?.outcomes === outcomes && result.before === before ? result.progress : null };
}
