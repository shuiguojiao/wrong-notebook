"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ReviewSessionItem } from '@/types/api';

// 沿用随主题切换的图表色，按稳定的科目顺序分配。
const SUBJECT_COLORS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5', 'bg-chart-6'] as const;

interface ReviewHomeCardProps { items: ReviewSessionItem[] }

export function ReviewHomeCard({ items }: ReviewHomeCardProps) {
    const { t } = useLanguage();
    const queue = items.slice(0, 20);
    const subjects = new Map<string, { name: string; count: number }>();
    for (const item of queue) {
        const key = item.subjectId ?? '';
        const existing = subjects.get(key);
        subjects.set(key, { name: item.subjectName || t.review.subjectUnknown, count: (existing?.count ?? 0) + 1 });
    }
    const colorById = new Map([...subjects.keys()].sort().map((id, index) => [id, SUBJECT_COLORS[index % SUBJECT_COLORS.length]]));
    const entries = [...new Map(items.filter(item => item.subjectId).map(item => [item.subjectId!, item.subjectName || t.review.subjectUnknown])).entries()];
    return <section className="space-y-6">
        <div className="space-y-4 rounded-xl border bg-card p-5 sm:p-6">
            <p className="text-3xl font-semibold">{t.review.limitCount.replace('{count}', String(queue.length))}</p>
            <ul className="space-y-3 border-t pt-4">
                {[...subjects].map(([id, subject]) => <li key={id} className="flex items-center gap-3">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${colorById.get(id)}`} />
                    <span className="flex-1">{subject.name}</span>
                    <span className="text-sm text-muted-foreground">{t.review.limitCount.replace('{count}', String(subject.count))}</span>
                </li>)}
            </ul>
        </div>
        <Button asChild className="min-h-12 w-full"><Link href="/review/session?limit=20&autostart=1">{t.review.start}</Link></Button>
        {!!entries.length && <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t.review.onlySubject}</p>
            <div className="flex flex-wrap gap-2">
                {entries.map(([id, name]) => <Button key={id} asChild variant="outline" className="min-h-11 rounded-full">
                    <Link href={`/review/session?${new URLSearchParams({ subjectId: id, limit: '20', autostart: '1' })}`}>{name}</Link>
                </Button>)}
            </div>
        </div>}
    </section>;
}
