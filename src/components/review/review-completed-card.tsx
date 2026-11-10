"use client";

import Link from 'next/link';
import { ProgressStamp } from '@/components/student/progress-stamp';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

interface ReviewCompletedCardProps { durationSec: number; answeredCount: number; dayKey: string }

export function ReviewCompletedCard({ durationSec, answeredCount, dayKey }: ReviewCompletedCardProps) {
    const { t } = useLanguage();
    return <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6">
        <ProgressStamp variant="done" date={dayKey.slice(dayKey.lastIndexOf(':') + 1)} />
        <h2 className="text-xl font-semibold">{t.review.summaryCleared}</h2>
        <p className="text-sm text-muted-foreground">{t.review.summaryElapsed.replace('{count}', String(answeredCount)).replace('{minutes}', String(Math.ceil(durationSec / 60)))}</p>
        <Button asChild variant="outline" className="min-h-12 w-full whitespace-normal"><Link href="/review/session?mode=extra&autostart=1">{t.review.extraPrompt}</Link></Button>
    </section>;
}
