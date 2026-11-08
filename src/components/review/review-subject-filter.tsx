"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import type { Notebook } from '@/types/api';

interface ReviewSubjectFilterProps { value: string; onChange: (value: string) => void }

/** 复用错题本列表作为科目来源，与到期接口的 subjectId 一致。 */
export function ReviewSubjectFilter({ value, onChange }: ReviewSubjectFilterProps) {
    const { t } = useLanguage();
    const [subjects, setSubjects] = useState<Notebook[]>([]);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let cancelled = false;
        apiClient.get<Notebook[]>('/api/notebooks')
            .then(items => { if (!cancelled) { setSubjects(items); setFailed(false); } })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [retry]);
    return <div className="space-y-2">
        <label className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{t.review.subject}</span>
            <select value={value} onChange={event => onChange(event.target.value)} className="min-h-11 max-w-full rounded-md border bg-background px-3 text-base">
                <option value="">{t.review.allSubjects}</option>
                {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
        </label>
        {failed && <p role="alert" className="text-sm text-destructive">{t.entry.loadNotebooksFailed}
            <Button variant="link" onClick={() => setRetry(count => count + 1)}>{t.review.retry}</Button>
        </p>}
    </div>;
}
