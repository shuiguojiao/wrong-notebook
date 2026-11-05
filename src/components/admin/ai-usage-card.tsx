"use client";

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { frontendLogger } from '@/lib/frontend-logger';
import type { AdminAiUsageData, UsageStats } from '@/lib/ai-usage-stats';

function UsageSummary({ stats }: { stats: UsageStats }) {
    const { t } = useLanguage();
    const u = t.aiUsage;
    return <div className="space-y-2 text-sm tabular-nums">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <div><dt className="text-muted-foreground">{u.calls}</dt><dd>{stats.calls.toLocaleString()}</dd></div>
            <div><dt className="text-muted-foreground">{u.input}</dt><dd>{stats.inputTokens.toLocaleString()}</dd></div>
            <div><dt className="text-muted-foreground">{u.output}</dt><dd>{stats.outputTokens.toLocaleString()}</dd></div>
            <div><dt className="text-muted-foreground">{u.cost}</dt><dd>{Object.entries(stats.costs).map(([currency, amount]) => `${currency} ${amount.toFixed(6)}`).join(' · ') || '—'}</dd></div>
        </dl>
        <p className="break-words text-muted-foreground">{Object.entries(stats.kinds).map(([kind, count]) => `${u.kinds[kind as keyof typeof u.kinds] ?? kind}: ${count}`).join(' · ')}</p>
        {(stats.unknownActions > 0 || stats.incompleteCosts > 0) && <p className="text-muted-foreground">{u.unknown}: {stats.unknownActions} · {u.unpriced}: {stats.incompleteCosts}</p>}
        {stats.models.length > 0 && <details><summary className="cursor-pointer">{u.models}</summary>{stats.models.map(model => <p className="break-all text-muted-foreground" key={JSON.stringify(model)}>{model.provider} / {model.model}</p>)}</details>}
    </div>;
}

export function AiUsageCard() {
    const { t } = useLanguage();
    const [data, setData] = useState<AdminAiUsageData | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const [month, setMonth] = useState(0);
    const load = useCallback(async () => {
        setLoading(true); setFailed(false);
        try { setData(await apiClient.get<AdminAiUsageData>('/api/admin/ai-usage')); }
        catch (error) { setFailed(true); frontendLogger.error('[AiUsageCard]', '读取 AI 用量失败', { error }); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 进入看板时读取统计
        void load();
    }, [load]);
    const period = data?.months[month];
    return <Card>
        <CardHeader className="gap-3">
            <CardTitle>{t.aiUsage.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{t.aiUsage.estimateNote}</p>
            <div className="flex flex-wrap gap-2">
                {[t.aiUsage.thisMonth, t.aiUsage.lastMonth].map((label, index) => <Button key={label} variant={month === index ? 'default' : 'outline'} onClick={() => setMonth(index)} aria-pressed={month === index}>{label}</Button>)}
                <Button variant="outline" onClick={load} disabled={loading}>{loading ? t.common.loading : t.aiUsage.refresh}</Button>
            </div>
        </CardHeader>
        <CardContent aria-busy={loading} className="space-y-4">
            {failed && <p role="alert">{t.common.error}</p>}
            {period && <>
                <p className="text-sm text-muted-foreground">{period.month} · {data?.timeZone}</p>
                <section className="space-y-2 rounded-lg bg-muted p-4"><h3 className="font-medium">{t.aiUsage.total}</h3><UsageSummary stats={period.total} /></section>
                <ul className="divide-y">{period.users.map(user => <li key={user.id} className="space-y-2 py-4">
                    <h3 className="break-words font-medium">{user.name || user.email}</h3>
                    {user.name && <p className="break-all text-sm text-muted-foreground">{user.email}</p>}
                    <UsageSummary stats={user.stats} />
                </li>)}</ul>
            </>}
        </CardContent>
    </Card>;
}
