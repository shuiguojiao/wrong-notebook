"use client";

import { useStatsData } from '@/lib/hooks/use-stats-data';
import type { RewardSummaryResponse } from '@/types/api';

export function useRewards() {
    return useStatsData<RewardSummaryResponse>('/api/rewards/summary');
}
