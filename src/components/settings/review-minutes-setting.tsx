"use client";

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/error-message';
import { frontendLogger } from '@/lib/frontend-logger';
import type { UserProfile } from '@/types/api';

/** 每日复习分钟额度独立保存，不与管理员全局设置混用。 */
export function ReviewMinutesSetting() {
    const { t } = useLanguage();
    const [value, setValue] = useState('30');
    const [saved, setSaved] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const number = Number(value);
    const valid = value.trim() !== '' && Number.isInteger(number) && number >= 10 && number <= 180 && number % 5 === 0;

    const load = useCallback(async () => {
        setLoading(true);
        setMessage(null);
        try {
            const user = await apiClient.get<UserProfile>('/api/user');
            const minutes = user.reviewDailyMinutes ?? 30;
            setValue(String(minutes));
            setSaved(minutes);
        } catch (error) {
            setMessage(t.review.loadFailed);
            frontendLogger.error('[Settings]', '加载复习分钟数失败', { error: getErrorMessage(error) });
        } finally {
            setLoading(false);
        }
    }, [t.review.loadFailed]);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- 数据请求：进入页面时加载，请求前后更新加载状态和结果
    useEffect(() => { void load(); }, [load]);

    const save = async () => {
        if (!valid || saved === null) return;
        setSaving(true);
        setMessage(null);
        try {
            const user = await apiClient.patch<UserProfile>('/api/user', { reviewDailyMinutes: number });
            const minutes = user.reviewDailyMinutes ?? number;
            setSaved(minutes);
            setValue(String(minutes));
            setMessage(t.importFlow.preferenceSaved);
        } catch (error) {
            setMessage(t.importFlow.preferenceSaveFailed);
            frontendLogger.error('[Settings]', '保存复习分钟数失败', { error: getErrorMessage(error) });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-2 border-t pt-4">
            <h3 className="font-medium">{t.review.settingsTitle}</h3>
            <Label htmlFor="review-daily-minutes">{t.review.dailyMinutes}</Label>
            <div className="flex flex-wrap items-center gap-2">
                <Input id="review-daily-minutes" type="number" min={10} max={180} step={5}
                    value={value} onChange={(event) => { setValue(event.target.value); setMessage(null); }}
                    disabled={loading || saving || saved === null} className="min-h-11 w-28" aria-describedby="review-daily-minutes-hint" />
                <Button type="button" className="min-h-11" size="sm" variant="outline" onClick={save} disabled={loading || saving || saved === null || !valid || number === saved}>
                    {(loading || saving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t.common.save}
                </Button>
                {!loading && saved === null && <Button type="button" className="min-h-11" size="sm" variant="outline" onClick={load}>{t.importFlow.retryLoad}</Button>}
            </div>
            <p id="review-daily-minutes-hint" className="text-xs text-muted-foreground">{t.review.dailyMinutesHint}</p>
            {saved !== null && !valid && <p className="text-xs text-destructive" role="alert">{t.review.dailyMinutesInvalid}</p>}
            {message && <p className="text-xs text-muted-foreground" role="status">{message}</p>}
        </div>
    );
}
