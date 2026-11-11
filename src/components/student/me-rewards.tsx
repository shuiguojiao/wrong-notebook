"use client";

import Link from 'next/link';
import { EnergyBean } from '@/components/student/energy-bean';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { useRewards } from '@/lib/hooks/use-rewards';

interface MeRewardsProps { rewards: ReturnType<typeof useRewards> }

/** 余额与本周所得都来自同一份汇总，不逐日查账。 */
export function MeRewards({ rewards: { data, error, loading } }: MeRewardsProps) {
    const { t } = useLanguage();
    if (!data?.enabled || error || loading) return null;
    return <Button asChild variant="ghost" className="min-h-12 w-full justify-start gap-3 whitespace-normal rounded-none">
        <Link href="/history"><EnergyBean /><span>{t.rewards.bean}</span><span className="ml-auto text-right text-sm">
            {t.rewards.beans.replace('{count}', String(data.balance))}
            <span className="block text-xs text-muted-foreground">{t.rewards.weekPoints.replace('{count}', String(data.week.points))}</span>
        </span></Link>
    </Button>;
}
