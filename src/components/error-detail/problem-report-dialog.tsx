"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/error-message";
import { toast } from "@/lib/feedback";
import { createReportSchema, REPORT_CATEGORIES, REPORT_DESCRIPTION_LIMIT } from "@/lib/problem-reports/schema";
import type { UserProblemReport } from "@/lib/problem-reports/schema";

interface ProblemReportDialogProps { errorItemId: string }

export function ProblemReportDialog({ errorItemId }: ProblemReportDialogProps) {
    const { t } = useLanguage();
    const r = t.problemReports;
    const [open, setOpen] = useState(false);
    const [category, setCategory] = useState("");
    const [description, setDescription] = useState("");
    const [reports, setReports] = useState<UserProblemReport[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const pending = useRef(false);
    const [error, setError] = useState("");
    const [loadError, setLoadError] = useState(false);

    async function load() {
        setLoading(true); setLoadError(false);
        try { setReports(await apiClient.get<UserProblemReport[]>("/api/problem-reports", { params: { errorItemId } })); }
        catch { setLoadError(true); }
        finally { setLoading(false); }
    }
    async function submit(event: React.FormEvent) {
        event.preventDefault();
        const parsed = createReportSchema.safeParse({ errorItemId, category, description });
        if (!parsed.success) { setError(r.invalid); return; }
        if (pending.current) return;
        pending.current = true; setSaving(true); setError("");
        try {
            const report = await apiClient.post<UserProblemReport>("/api/problem-reports", parsed.data);
            setReports(previous => [report, ...previous]);
            setDescription(""); setCategory(""); toast.success(r.received);
        } catch (err) {
            setError(getApiErrorMessage(err) === 'Daily report limit reached' ? r.limitReached : r.submitFailed);
        } finally { pending.current = false; setSaving(false); }
    }
    return <Dialog open={open} onOpenChange={value => { if (saving) return; setOpen(value); if (value) { setError(""); void load(); } }}>
        <DialogTrigger asChild><Button variant="outline">{r.title}</Button></DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>{r.title}</DialogTitle><DialogDescription>{r.privacy}</DialogDescription></DialogHeader>
            <form onSubmit={submit} className="space-y-4" noValidate>
                <div className="space-y-2"><label htmlFor="report-category">{r.category}</label>
                    <select id="report-category" className="w-full min-h-11 rounded-md border bg-background px-3" value={category} onChange={e => setCategory(e.target.value)} disabled={saving}>
                        <option value="">{r.category}</option>{REPORT_CATEGORIES.map(key => <option key={key} value={key}>{r.categories[key]}</option>)}
                    </select>
                </div>
                <div className="space-y-2"><label htmlFor="report-description">{r.description}</label>
                    <Textarea id="report-description" value={description} maxLength={REPORT_DESCRIPTION_LIMIT} rows={4} disabled={saving}
                        aria-invalid={!!error} aria-describedby={error ? 'report-error' : undefined}
                        onChange={e => setDescription(e.target.value)} onBlur={() => { if (description && !description.trim()) setError(r.invalid); }} />
                    <p className="text-sm text-muted-foreground">{description.length} / {REPORT_DESCRIPTION_LIMIT}</p>
                </div>
                {error && <p id="report-error" role="alert">{error}</p>}
                <Button type="submit" disabled={saving || loading} className="min-h-11">{saving ? t.common.loading : r.submit}</Button>
            </form>
            <section className="space-y-3 border-t pt-4" aria-busy={loading}>
                <h3 className="font-semibold">{r.history}</h3>
                {loading ? <p role="status">{t.common.loading}</p> : loadError ? <div><p role="alert">{r.loadFailed}</p><Button variant="outline" onClick={load}>{r.refresh}</Button></div> : reports.length === 0 ? <p>{r.empty}</p> : reports.map(report => <article key={report.id} className="space-y-2 rounded-md border p-3 text-sm break-words">
                    <p>{r.categories[report.category]} · {r.statuses[report.status]}</p>
                    <time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString()}</time>
                    <p className="whitespace-pre-wrap">{report.description}</p>
                    {report.adminNote && <p className="whitespace-pre-wrap">{r.adminNote}: {report.adminNote}</p>}
                </article>)}
            </section>
        </DialogContent>
    </Dialog>;
}
