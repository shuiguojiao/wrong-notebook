"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { HistorySheet } from '@/components/history/history-sheet';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStatsData } from '@/lib/hooks/use-stats-data';
import type { Notebook } from '@/types/api';

interface HistoryFiltersProps { subjectId: string; wrongOnly: boolean; onChange: (values: Record<string, string | null>) => void }

export function HistoryFilters({ subjectId, wrongOnly, onChange }: HistoryFiltersProps) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const notebooks = useStatsData<Notebook[]>('/api/notebooks');
    const controls = <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t.history.subject} className="flex flex-wrap gap-2">
            {[{ id: '', name: t.filter.all }, ...(notebooks.data ?? [])].map(subject => <Button key={subject.id} variant={subjectId === subject.id ? 'default' : 'outline'} aria-pressed={subjectId === subject.id} className="student-sticker min-h-11 rounded-full" onClick={() => onChange({ subjectId: subject.id || null, record: null })}>{subject.name}</Button>)}
        </div>
        {notebooks.loading && <span className="h-11 w-24 animate-pulse rounded-full bg-muted motion-reduce:animate-none" aria-label={t.common.loading} />}
        {notebooks.error && <Button variant="ghost" onClick={notebooks.reload}>{t.history.loadFailed} · {t.review.retry}</Button>}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><Switch checked={wrongOnly} onCheckedChange={checked => onChange({ result: checked ? 'wrong' : null, record: null })} />{t.history.onlyWrong}</label>
    </div>;
    return <>
        <div className="hidden lg:block">{controls}</div>
        <Button variant="outline" className="min-h-11 lg:hidden" onClick={() => setOpen(true)}>{t.notebook.filter}{subjectId || wrongOnly ? ' · ✓' : ''}</Button>
        <HistorySheet open={open} onClose={() => setOpen(false)} title={t.notebook.filter}>{controls}</HistorySheet>
    </>;
}
