"use client";

import { BadgeStamp } from '@/components/student/badge-stamp';
import { NetworkNotice } from '@/components/student/network-notice';
import { PaperCard } from '@/components/student/paper-card';
import { StudentSkeleton } from '@/components/student/student-skeleton';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStatsData } from '@/lib/hooks/use-stats-data';
import { REWARD_BADGES } from '@/lib/rewards/badges';
import type { BadgeCategory } from '@/lib/rewards/badges';
import type { RewardBadgeResponse, RewardBadgesResponse } from '@/types/api';

interface BadgeCollectionContentProps { badges: RewardBadgeResponse[] }
const categories: BadgeCategory[] = ['persistence', 'courage', 'correction', 'hidden'];

export function BadgeCollectionContent({ badges }: BadgeCollectionContentProps) {
    const { t, language } = useLanguage();
    const records = new Map(badges.map(badge => [badge.id, badge]));
    const count = REWARD_BADGES.filter(badge => records.get(badge.id)?.earned).length;
    function earnedOn(badge: RewardBadgeResponse) {
        if (badge.backfilled) return t.rewards.badgeEarnedEarlier;
        if (!badge.day) return null;
        // day 已是应用日；用 UTC 展示日历日期，避免设备时区把日期挪到前一天。
        const date = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${badge.day}T12:00:00Z`));
        return t.rewards.badgeEarnedOn.replace('{date}', date);
    }
    return <div className="space-y-6">
        <p className="text-lg tabular-nums">{t.rewards.badgeCount.replace('{count}', String(count)).replace('{total}', String(REWARD_BADGES.length))}</p>
        {categories.map(category => <PaperCard key={category}>
            <section aria-label={t.rewards.badgeCategories[category]}>
                <h2 className="mb-6 border-b pb-3 font-title text-xl font-semibold">{t.rewards.badgeCategories[category]}</h2>
                <ul className="grid grid-cols-3 gap-x-2 gap-y-6 md:grid-cols-4 lg:grid-cols-6">
                    {REWARD_BADGES.filter(badge => badge.category === category).map(badge => {
                        const record = records.get(badge.id);
                        return <li key={badge.id} className="flex min-w-0 flex-col items-center gap-2 text-center">
                            <BadgeStamp badgeId={badge.id} earned={record?.earned ?? false} />
                            {record?.earned && <p className="text-xs text-muted-foreground">{earnedOn(record)}</p>}
                        </li>;
                    })}
                </ul>
            </section>
        </PaperCard>)}
    </div>;
}

export function BadgeCollection() {
    const { data, loading, error, reload } = useStatsData<RewardBadgesResponse>('/api/rewards/badges');
    if (loading) return <StudentSkeleton variant="block" className="h-80" />;
    if (error) return <NetworkNotice onRetry={reload} />;
    return data ? <BadgeCollectionContent badges={data.badges} /> : null;
}
