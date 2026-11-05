"use client";

import { useEffect, useState } from "react";
import { ProblemReportCard } from "@/components/admin/problem-report-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { REPORT_CATEGORIES, REPORT_STATUSES } from "@/lib/problem-reports/schema";
import type { AdminProblemReport } from "@/lib/problem-reports/schema";

export function ProblemReportsPanel() {
    const { t } = useLanguage();
    const r = t.problemReports;
    const [status, setStatus] = useState("open");
    const [category, setCategory] = useState("");
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [data, setData] = useState<{ reports: AdminProblemReport[]; total: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 筛选条件变化后请求列表并更新加载状态
        setLoading(true); setFailed(false);
        const params: Record<string, string> = { page: String(page) };
        if (status) params.status = status;
        if (category) params.category = category;
        apiClient.get<{ reports: AdminProblemReport[]; total: number }>("/api/admin/problem-reports", { params, signal: controller.signal })
            .then(value => { if (!controller.signal.aborted) setData(value); })
            .catch(() => { if (!controller.signal.aborted) setFailed(true); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [status, category, page, revision]);
    return <Card>
        <CardHeader><CardTitle>{r.adminTitle}</CardTitle><p className="text-sm text-muted-foreground">{r.adminPrivacy}</p>
            <div className="flex flex-wrap items-end gap-3">
                <label>{r.status}<select className="block min-h-11 rounded-md border bg-background px-3" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
                    <option value="">{r.all}</option>{REPORT_STATUSES.map(key => <option key={key} value={key}>{r.statuses[key]}</option>)}
                </select></label>
                <label>{r.category}<select className="block min-h-11 rounded-md border bg-background px-3" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
                    <option value="">{r.all}</option>{REPORT_CATEGORIES.map(key => <option key={key} value={key}>{r.categories[key]}</option>)}
                </select></label>
                <Button variant="outline" disabled={loading} onClick={() => setRevision(x => x + 1)}>{r.refresh}</Button>
            </div>
        </CardHeader>
        <CardContent aria-busy={loading} className="space-y-4">
            {failed ? <p role="alert">{r.loadFailed}</p> : loading ? <p role="status">{t.common.loading}</p> : data && <>
                {data.reports.length === 0 && <p>{r.empty}</p>}
                {data.reports.map(report => <ProblemReportCard key={`${report.id}:${report.updatedAt}`} report={report} onSaved={() => setRevision(x => x + 1)} />)}
                <div className="flex items-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(x => x - 1)}>{r.previous}</Button>
                    <span>{page} / {Math.max(1, Math.ceil(data.total / 20))}</span>
                    <Button variant="outline" disabled={page * 20 >= data.total} onClick={() => setPage(x => x + 1)}>{r.next}</Button></div>
            </>}
        </CardContent>
    </Card>;
}
