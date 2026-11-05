"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import { apiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/date-time";
import { frontendLogger } from "@/lib/frontend-logger";
import type { BackupOverview } from "@/lib/server-backup/schema";

export function ServerBackupCard() {
    const { t } = useLanguage();
    const { timeZone } = useTimeZone();
    const text = t.serverBackup;
    const [data, setData] = useState<BackupOverview | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const refresh = useCallback(async () => {
        try {
            setData(await apiClient.get<BackupOverview>("/api/admin/backups"));
            setError(false);
        } catch (error) {
            frontendLogger.error("[ServerBackup]", "备份状态读取失败", { error });
            setError(true);
        }
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 进入管理页时加载服务端状态，后续定期更新以呈现后台进度
        void refresh();
        const timer = setInterval(() => { void refresh(); }, 5000);
        return () => clearInterval(timer);
    }, [refresh]);
    const run = async () => {
        setBusy(true);
        try {
            await apiClient.post("/api/admin/backups", {});
            await refresh();
        } catch (error) {
            frontendLogger.error("[ServerBackup]", "备份触发失败", { error });
            setError(true);
        } finally { setBusy(false); }
    };
    const date = (value: string | null) => value ? formatDateTime(value, "yyyy-MM-dd HH:mm:ss", timeZone) : text.never;
    return (
        <Card>
            <CardHeader>
                <CardTitle>{text.title}</CardTitle>
                <CardDescription>{text.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4" aria-busy={busy || data?.running}>
                {error && <p role="alert" className="text-destructive">{text.requestFailed}</p>}
                {!data ? <Button onClick={refresh} variant="outline" className="min-h-11">{error ? t.admin.dashboard.retry : text.loading}</Button> : <>
                    {data.stale && <p role="alert" className="rounded-md border border-destructive p-3 font-medium text-destructive">{text.stale}</p>}
                    {data.status.result === "partial" && <p role="alert" className="rounded-md border border-amber-500 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100">{text.partialWarning.replace("{count}", String((data.status.manifest?.missingImages ?? 0) + (data.status.manifest?.corruptImages ?? 0)))}</p>}
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div><dt className="text-muted-foreground">{text.lastSuccess}</dt><dd>{date(data.status.lastSuccessAt)}</dd></div>
                        <div><dt className="text-muted-foreground">{text.lastComplete}</dt><dd>{date(data.status.lastCompleteAt)}</dd></div>
                        <div aria-live="polite"><dt className="text-muted-foreground">{text.result}</dt><dd>{data.running ? text.running : text[data.status.result]}{data.status.errorCode && <span className="ml-2 break-all text-destructive">{data.status.errorCode}</span>}</dd></div>
                        <div className="sm:col-span-2 min-w-0"><dt className="text-muted-foreground">{text.directory}</dt><dd className="break-all font-mono">{data.directory || text.unavailable}</dd></div>
                        <div><dt className="text-muted-foreground">{text.keep}</dt><dd>{data.keep}</dd></div>
                        <div><dt className="text-muted-foreground">{text.schedule}</dt><dd>{data.enabled ? text.enabled : text.disabled}</dd></div>
                        <div><dt className="text-muted-foreground">{text.started}</dt><dd>{date(data.status.startedAt)}</dd></div>
                        <div><dt className="text-muted-foreground">{text.finished}</dt><dd>{date(data.status.finishedAt)}</dd></div>
                    </dl>
                    {data.status.manifest && <p className="text-sm text-muted-foreground">{text.images}: {data.status.manifest.referencedImages} · {text.missing}: {data.status.manifest.missingImages} · {text.corrupt}: {data.status.manifest.corruptImages} · {text.duration}: {(data.status.manifest.durationMs / 1000).toFixed(1)}s</p>}
                    <p className="text-sm text-muted-foreground">{text.diskWarning}</p>
                    <Button onClick={run} disabled={busy || data.running || !data.enabled} className="min-h-11 w-full sm:w-auto">{busy || data.running ? text.running : text.run}</Button>
                    <details className="text-sm">
                        <summary className="cursor-pointer py-2">{text.snapshots} ({data.snapshots.length})</summary>
                        <ul className="space-y-2 pt-2">{data.snapshots.map((snapshot) => <li key={snapshot.name} className="break-all"><time>{date(snapshot.createdAt)}</time> · {(snapshot.size / 1024 / 1024).toFixed(2)} MB<br /><span className="font-mono text-xs text-muted-foreground">{snapshot.name}</span></li>)}</ul>
                    </details>
                </>}
            </CardContent>
        </Card>
    );
}
