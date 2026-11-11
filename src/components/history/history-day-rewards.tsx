"use client";

import { EnergyBean } from '@/components/student/energy-bean';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStatsData } from '@/lib/hooks/use-stats-data';
import type { RewardLedgerResponse } from '@/types/api';

interface HistoryDayRewardsProps { day: string }

/** 父组件只为选中的日期挂载，避免整张历史列表逐日取数。 */
export function HistoryDayRewards({ day }: HistoryDayRewardsProps) {
    const { t } = useLanguage();
    const { data, loading, error } = useStatsData<RewardLedgerResponse>(`/api/rewards/ledger?day=${day}`);
    if (!data || loading || error) return null;
    return <span className="inline-flex shrink-0 items-center gap-1 text-sm tabular-nums" aria-label={data.points ? t.rewards.balanceLabel.replace('{count}', String(data.points)) : t.rewards.bean}>
        <EnergyBean size={16} />{data.points ? t.rewards.beans.replace('{count}', String(data.points)) : '—'}
    </span>;
}
