"use client";

import { useEffect, useState } from 'react';
import { BadgeStamp } from '@/components/student/badge-stamp';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { REWARD_BADGES } from '@/lib/rewards/badges';
import { sessionBadgeIds } from '@/lib/rewards/session-badges';
import type { RewardBadgesResponse, RewardSummaryResponse } from '@/types/api';

interface SessionBadgesProps { summary: RewardSummaryResponse | null; startedAt?: string }

export function SessionBadges({ summary, startedAt }: SessionBadgesProps) {
    const { t } = useLanguage();
    const [extra, setExtra] = useState<{ startedAt: string; badges: RewardBadgesResponse['badges'] } | null>(null);
    useEffect(() => {
        if (!summary || !startedAt) return;
        let cancelled = false;
        // summary 只含今日 day 的账目，再读一次全集以包含本次结算的历史成就。
        void apiClient.get<RewardBadgesResponse>('/api/rewards/badges').then(data => {
            if (!cancelled) setExtra({ startedAt, badges: data.badges });
        }).catch(() => {
            // 奖励查询失败不打断收工；保留汇总中已经拿到的新章。
        });
        return () => { cancelled = true; };
    }, [summary, startedAt]);
    const ids = sessionBadgeIds(summary?.today.entries ?? [], summary && extra?.startedAt === startedAt ? extra?.badges ?? [] : [], startedAt);
    if (!ids.length) return null;
    return <section aria-label={t.rewards.newBadges} className="space-y-3">
        <h2 className="font-title text-lg font-semibold">{t.rewards.newBadges}</h2>
        <ul className="flex flex-wrap gap-4">
            {REWARD_BADGES.filter(badge => ids.includes(badge.id)).map(badge => <li key={badge.id} className="flex min-w-0 flex-col items-center gap-2 text-center">
                <BadgeStamp badgeId={badge.id} earned size="sm" animate />
            </li>)}
        </ul>
    </section>;
}
