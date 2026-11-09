"use client";

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTimeZone } from '@/contexts/TimeZoneContext';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/date-time';
import { getApiErrorMessage } from '@/lib/error-message';

export interface ReviewScheduleResponse { stage: number; totalRounds: number; nextReviewAt: string | null; completedAt: string | null }
interface ReviewSchedulePanelProps { id: string; revision: string; onChange?: (state: ReviewScheduleResponse) => void }

/** 复习安排独立于 AI 掌握度；手动调整不新增作答记录。 */
export function ReviewSchedulePanel({ id, revision, onChange }: ReviewSchedulePanelProps) {
    const { t } = useLanguage();
    const { timeZone } = useTimeZone();
    const [state, setState] = useState<ReviewScheduleResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    const readVersion = useRef(0);
    const writeLock = useRef(false);
    useEffect(() => {
        let cancelled = false;
        const version = ++readVersion.current;
        apiClient.get<ReviewScheduleResponse>(`/api/error-items/${encodeURIComponent(id)}/review`)
            .then(value => { if (!cancelled && readVersion.current === version) { setState(value); setError(null); } })
            .catch(err => { if (!cancelled && readVersion.current === version) setError(getApiErrorMessage(err) || t.review.scheduleFailed); });
        return () => { cancelled = true; };
    }, [id, revision, retry, t.review.scheduleFailed]);
    async function adjust(action: 'completed' | 'restart') {
        if (writeLock.current) return;
        writeLock.current = true;
        readVersion.current++;
        setBusy(true); setError(null);
        try {
            const next = await apiClient.put<ReviewScheduleResponse>(`/api/error-items/${encodeURIComponent(id)}/review`, { action });
            setState(next);
            onChange?.(next);
        }
        catch (err) { setError(getApiErrorMessage(err) || t.review.scheduleFailed); }
        finally { writeLock.current = false; setBusy(false); }
    }
    return <Card>
        <CardHeader><CardTitle className="text-base">{t.review.schedule}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
            {state ? <div className="space-y-1" aria-live="polite">
                <p>{state.completedAt ? t.review.scheduleComplete : t.review.round.replace('{round}', String(state.stage + 1)).replace('{total}', String(state.totalRounds))}</p>
                {state.nextReviewAt && <p className="text-sm text-muted-foreground">{t.review.nextReview}：{formatDateTime(state.nextReviewAt, 'yyyy-MM-dd', timeZone)}</p>}
            </div> : !error && <p role="status">{t.common.loading}</p>}
            <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="min-h-11" disabled={busy || !state || !!state.completedAt} onClick={() => void adjust('completed')}>{t.review.markCompleted}</Button>
                <Button variant="outline" className="min-h-11" disabled={busy || !state} onClick={() => void adjust('restart')}>{t.review.restart}</Button>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}<Button variant="link" onClick={() => setRetry(value => value + 1)}>{t.review.retry}</Button></p>}
        </CardContent>
    </Card>;
}
