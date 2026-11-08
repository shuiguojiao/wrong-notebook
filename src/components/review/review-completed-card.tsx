"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

interface ReviewCompletedCardProps { durationSec: number }

export function ReviewCompletedCard({ durationSec }: ReviewCompletedCardProps) {
    const { t } = useLanguage();
    return <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold">{t.review.todayComplete}</h2>
        <p className="text-sm text-muted-foreground">{t.review.todayElapsed.replace('{minutes}', String(Math.floor(durationSec / 60))).replace('{seconds}', String(durationSec % 60))}</p>
        <Button asChild className="min-h-12 w-full"><Link href="/review/session?mode=extra&autostart=1">{t.review.extra}</Link></Button>
    </section>;
}
