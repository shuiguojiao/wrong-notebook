"use client";

import { useState } from "react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/feedback";
import { REPORT_NOTE_LIMIT, REPORT_STATUSES } from "@/lib/problem-reports/schema";
import type { AdminProblemReport } from "@/lib/problem-reports/schema";

interface ProblemReportCardProps { report: AdminProblemReport; onSaved: () => void }

export function ProblemReportCard({ report, onSaved }: ProblemReportCardProps) {
    const { t } = useLanguage();
    const r = t.problemReports;
    const [status, setStatus] = useState(report.status);
    const [note, setNote] = useState(report.adminNote);
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState(false);
    const s = report.snapshot;
    async function save(event: React.FormEvent) {
        event.preventDefault(); setSaving(true); setFailed(false);
        try { await apiClient.patch(`/api/admin/problem-reports/${report.id}`, { status, adminNote: note }); toast.success(r.saved); onSaved(); }
        catch { setFailed(true); }
        finally { setSaving(false); }
    }
    return <article className="min-w-0 space-y-3 rounded-lg border p-4 break-words">
        <p className="font-medium">{report.user.name} · {report.user.email}</p>
        <p className="text-sm">{new Date(report.createdAt).toLocaleString()} · {r.categories[report.category]} · {r.statuses[report.status]}</p>
        <p className="whitespace-pre-wrap">{report.description}</p>
        <details className="min-w-0"><summary className="cursor-pointer py-2">{r.snapshot}</summary>
            <div className="space-y-4 py-3">
                {(['questionText', 'answerText', 'analysis'] as const).map(field => <section key={field}><h4 className="font-medium">{r[field]}</h4><MarkdownRenderer content={s[field]} snapshotOnly /></section>)}
                <p>{r.knowledgePoints}: {s.knowledgePoints.join(' · ') || '—'}</p>
                <p>{r.subject}: {s.subject || '—'} · {r.gradeSemester}: {s.gradeSemester || '—'}</p>
                <p>{r.source}: {s.source || '—'} · {r.entryMethod}: {r.entryMethods[s.entryMethod]}</p>
                <p>{r.hasOriginalImage}: {s.hasOriginalImage ? r.yes : r.no}</p>
                <p>{r.model}: {s.aiProvider || r.unknown} / {s.aiModel || r.unknown}</p>
            </div>
        </details>
        <form className="space-y-3" onSubmit={save}>
            <label className="block">{r.status}<select className="mt-1 block min-h-11 w-full rounded-md border bg-background px-3" value={status} disabled={saving} onChange={e => setStatus(e.target.value as typeof status)}>
                {REPORT_STATUSES.map(key => <option key={key} value={key}>{r.statuses[key]}</option>)}
            </select></label>
            <label className="block">{r.adminNote}<Textarea className="mt-1" value={note} maxLength={REPORT_NOTE_LIMIT} onChange={e => setNote(e.target.value)} disabled={saving} /></label>
            <p className="text-sm text-muted-foreground">{note.length} / {REPORT_NOTE_LIMIT}</p>
            {failed && <p role="alert">{r.saveFailed}</p>}
            <Button type="submit" disabled={saving}>{saving ? t.common.loading : r.save}</Button>
        </form>
    </article>;
}
