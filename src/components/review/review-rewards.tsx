"use client";

import { useEffect, useRef } from 'react';
import { SessionBadges } from '@/components/review/session-badges';
import { PaperCard } from '@/components/student/paper-card';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRewards } from '@/lib/hooks/use-rewards';
import { sessionRewardTotals, sessionSettlements, streakDays } from '@/lib/rewards/presentation';
import type { ReviewOutcome } from '@/lib/review-session';

interface ReviewRewardsProps { outcomes: ReviewOutcome[]; startedAt?: string; enabled?: boolean; refreshKey?: number | null }

export function ReviewRewards({ outcomes, startedAt, enabled = true, refreshKey = null }: ReviewRewardsProps) {
    const { t } = useLanguage();
    const { data, loading, error, reload } = useRewards();
    const lastKey = useRef(refreshKey);
    // 掌握评估是异步的：收工小结拿到掌握变化后再结算一次，补上“彻底掌握”“贴上贴纸”的账目。
    useEffect(() => {
        if (refreshKey === lastKey.current) return;
        lastKey.current = refreshKey;
        if (refreshKey !== null) reload();
    }, [refreshKey, reload]);
    if (!enabled || data?.enabled === false) return null;
    const totals = sessionRewardTotals(outcomes);
    const settled = !loading && !error && data ? data : null;
    const rows: { key: string; points: number; label: string }[] = (['review', 'correction', 'brave'] as const).filter(type => totals[type] !== 0).map(type => ({
        key: type, points: totals[type], label: t.rewards[`${type}Total`].replace('{count}', String(totals[type])),
    }));
    const settlements = sessionSettlements(settled?.today.entries ?? [], startedAt);
    // 掌握与贴纸可能一次好几条，合并成一行；收工与连续里程碑各自一行。
    for (const type of ['mastered', 'sticker'] as const) {
        const group = settlements.filter(entry => entry.type === type);
        if (!group.length) continue;
        const points = group.reduce((sum, entry) => sum + entry.points, 0);
        rows.push({ key: type, points, label: t.rewards[`${type}Total`].replace('{count}', String(group.length)).replace('{points}', String(points)) });
    }
    settlements.filter(entry => entry.type === 'done' || entry.type === 'streak').forEach((entry, index) => {
        const template = entry.type === 'done' ? t.rewards.earnedDone : t.rewards.earnedStreak;
        rows.push({ key: `settled-${index}`, points: entry.points,
            label: template.replace('{points}', String(entry.points)).replace('{days}', streakDays(entry)) });
    });
    return <><PaperCard><section aria-label={t.rewards.sessionTitle} className="space-y-3">
        <h2 className="font-title text-lg font-semibold">{t.rewards.sessionTitle}</h2>
        <ul className="space-y-2">{rows.map((row, index) => <li key={row.key} className="reward-stamp text-sm" style={{ animationDelay: `${Math.min(index * 120, 720)}ms` }}>{row.label}</li>)}</ul>
        <p className="border-t pt-3 font-semibold tabular-nums">{t.rewards.sessionTotal.replace('{count}', String(rows.reduce((sum, row) => sum + row.points, 0)))}</p>
        {settled && <p className="text-sm text-muted-foreground">{t.rewards.balance.replace('{count}', String(settled.balance))}</p>}
    </section></PaperCard><SessionBadges summary={!error ? data : null} startedAt={startedAt} /></>;
}
