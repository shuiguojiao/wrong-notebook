"use client";

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

export interface PendingExam { id: string; paperId: string; status: 'answering' | 'grading' | 'reviewing'; paper: { title: string } }
export function usePendingExams() {
    const [attempts, setAttempts] = useState<PendingExam[]>([]);
    const [error, setError] = useState(false);
    useEffect(() => {
        let active = true;
        let timeout: ReturnType<typeof setTimeout>;
        const load = async () => {
            if (!active || document.hidden) return;
            try {
                const result = await apiClient.get<PendingExam[]>('/api/exam-attempts/pending');
                if (active) { setAttempts(Array.isArray(result) ? result : []); setError(false); }
            } catch { if (active) setError(true); }
            if (active && !document.hidden) timeout = setTimeout(load, 15000);
        };
        const visibility = () => { clearTimeout(timeout); if (!document.hidden) void load(); };
        void load(); document.addEventListener('visibilitychange', visibility);
        return () => { active = false; clearTimeout(timeout); document.removeEventListener('visibilitychange', visibility); };
    }, []);
    return { attempts, error };
}
