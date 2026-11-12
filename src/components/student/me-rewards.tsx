"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { useRewards } from '@/lib/hooks/use-rewards';

interface MeRewardsProps { rewards: ReturnType<typeof useRewards> }

function MeEnergyBeanIcon() {
    return (
        <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
            <path
                d="M3.5 12.6C3.5 8.8 6 6 9.2 6c2.6 0 3.4 2 5.3 2 1.4 0 2.1-1.2 3.5-1.2 2 0 2.9 1.7 2.9 3.6 0 4.7-4.4 8.5-9.7 8.5-4.4 0-7.7-2.5-7.7-6.3Z"
                fill="var(--bean-fill)"
                stroke="var(--bean-ink)"
                strokeWidth="1.75"
            />
            <path d="M12.4 9.3 8.6 13.4h2.8l-.5 3.2 4.5-4.6h-3.1l.5-2.5a.2.2 0 0 0-.4-.2Z" fill="var(--bean-ink)" />
        </svg>
    );
}

function WeeklyJournalIcon() {
    return (
        <svg
            aria-hidden="true"
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--nb-math-ink, currentColor)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="5" y="3" width="14" height="18" rx="2.5" fill="var(--nb-math, var(--secondary))" />
            <path d="M3.5 8h3M3.5 12h3M3.5 16h3M10 8h5M10 12h5M10 16h2.5" />
        </svg>
    );
}

/** 余额与本周所得都来自同一份汇总，不逐日查账。 */
export function MeRewards({ rewards: { data, error, loading } }: MeRewardsProps) {
    const { t } = useLanguage();
    if (!data?.enabled || error || loading) return null;
    return (
        <>
            <Button asChild variant="ghost" className="min-h-12 w-full justify-start gap-3 whitespace-normal rounded-none">
                <Link href="/history">
                    <MeEnergyBeanIcon />
                    <span>{t.rewards.bean}</span>
                    <span className="ml-auto text-right text-sm">
                        {t.rewards.beans.replace('{count}', String(data.balance))}
                        <span className="block text-xs text-muted-foreground">
                            {t.rewards.weekPoints.replace('{count}', String(data.week.points))}
                        </span>
                    </span>
                </Link>
            </Button>
            <Button asChild variant="ghost" className="min-h-12 w-full justify-start gap-3 rounded-none">
                <Link href={`/history?journal=${data.week.start}`}>
                    <WeeklyJournalIcon />
                    {t.rewards.journalEntry}
                </Link>
            </Button>
        </>
    );
}
