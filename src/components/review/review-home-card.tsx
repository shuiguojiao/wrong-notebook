"use client";

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ReviewSessionItem } from '@/types/api';

// 沿用随主题切换的图表色，按稳定的科目顺序分配。
const SUBJECT_COLORS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5', 'bg-chart-6'] as const;

interface ReviewHomeCardProps { items: ReviewSessionItem[] }

export function ReviewHomeCard({ items }: ReviewHomeCardProps) {
    const { t } = useLanguage();
    const queue = items;
    const subjects = new Map<string, { name: string; count: number; seconds: number }>();
    for (const item of queue) {
        const key = item.subjectId ?? '';
        const existing = subjects.get(key);
        subjects.set(key, { name: item.subjectName || t.review.subjectUnknown, count: (existing?.count ?? 0) + 1, seconds: (existing?.seconds ?? 0) + (item.estimatedSec ?? 0) });
    }
    const colorById = new Map([...subjects.keys()].sort().map((id, index) => [id, SUBJECT_COLORS[index % SUBJECT_COLORS.length]]));
    return <section className="space-y-6">
        <div className="space-y-4 rounded-xl border bg-card p-5 text-card-foreground sm:p-6">
            <p className="flex flex-wrap items-baseline gap-3"><span className="text-3xl font-semibold tracking-tight">{t.review.approxMinutes.replace('{minutes}', String(Math.ceil(queue.reduce((sum, item) => sum + (item.estimatedSec ?? 0), 0) / 60)))}</span><span className="text-muted-foreground">{t.review.limitCount.replace('{count}', String(queue.length))}</span></p>
            <ul className="space-y-2 border-t pt-3">
                {[...subjects].map(([id, subject]) => {
                    const content = <>
                        <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${colorById.get(id)}`} />
                        <span className="min-w-0 flex-1 break-words font-medium">{subject.name}</span>
                        <span className="shrink-0 text-right text-sm text-muted-foreground">
                            {t.review.limitCount.replace('{count}', String(subject.count))} · {t.review.approxMinutes.replace('{minutes}', String(Math.ceil(subject.seconds / 60)))}
                        </span>
                        {id && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
                    </>;
                    return <li key={id}>
                        {id ? <Link href={`/review/session?${new URLSearchParams({ subjectId: id, autostart: '1' })}`} className="-mx-2 flex min-h-12 items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none sm:gap-3">
                            {content}
                        </Link> : <div className="flex min-h-12 items-center gap-2 py-2 sm:gap-3">{content}</div>}
                    </li>;
                })}
            </ul>
        </div>
        <Button asChild className="min-h-12 w-full"><Link href="/review/session?autostart=1">{t.review.start}</Link></Button>
    </section>;
}
