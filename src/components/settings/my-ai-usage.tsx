"use client";

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { frontendLogger } from '@/lib/frontend-logger';

export interface MyAiUsageData {
    month: string;
    timeZone: string;
    calls: number;
    totalTokens: number;
    unknownActions: number;
    todayCalls: number;
    dailyLimit: number;
    monthlyTokenLimit: number;
    admin: boolean;
}

export function MyAiUsage() {
    const { t } = useLanguage();
    const [data, setData] = useState<MyAiUsageData | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const load = useCallback(async () => {
        setLoading(true); setFailed(false);
        try { setData(await apiClient.get<MyAiUsageData>('/api/ai-usage')); }
        catch (error) { setFailed(true); frontendLogger.error('[MyAiUsage]', '读取个人用量失败', { error }); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开账户设置时读取当前用量
        void load();
    }, [load]);
    const limit = (value: number) => data?.admin || value === 0 ? t.aiUsage.unlimited : value.toLocaleString();
    return <section className="space-y-3 rounded-lg border p-4" aria-busy={loading}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{t.aiUsage.mine}</h3><Button variant="outline" onClick={load} disabled={loading}>{loading ? t.common.loading : t.aiUsage.refresh}</Button></div>
        {failed && <p role="alert">{t.common.error}</p>}
        {data && <div className="space-y-2 text-sm tabular-nums">
            <p className="text-muted-foreground">{data.month} · {data.timeZone}</p>
            <p>{t.aiUsage.monthCalls}: {data.calls.toLocaleString()}</p>
            <p>{t.aiUsage.todayCalls}: {data.todayCalls.toLocaleString()} / {limit(data.dailyLimit)}</p>
            <p>{t.aiUsage.monthTokens}: {data.totalTokens.toLocaleString()} / {limit(data.monthlyTokenLimit)}</p>
            {data.unknownActions > 0 && <p>{t.aiUsage.unknown}: {data.unknownActions}</p>}
        </div>}
        <p className="text-sm text-muted-foreground">{t.aiUsage.monthlyNote}</p>
    </section>;
}
