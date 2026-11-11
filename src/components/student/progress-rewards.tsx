"use client";

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { KnowledgeSticker } from '@/components/student/knowledge-sticker';
import { BadgeStamp } from '@/components/student/badge-stamp';
import { ProgressStamp } from '@/components/student/progress-stamp';
import { useLanguage } from '@/contexts/LanguageContext';
import type { StudentProgress } from '@/lib/student-progress';
import { REWARD_BADGES } from '@/lib/rewards/badges';
import type { RewardSummaryResponse } from '@/types/api';

interface ProgressRewardsProps { data: StudentProgress }

export function StreakReward({ data }: ProgressRewardsProps) {
    const { t } = useLanguage();
    return <Link href="/history" aria-label={t.history.title} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" title={data.reviewedToday ? t.history.title : t.student.streakContinue}>
        <ProgressStamp variant="streak" days={data.streak} className="student-today-streak" />
    </Link>;
}

interface HarvestProps { data?: StudentProgress | null; recentBadges?: RewardSummaryResponse['recentBadges']; enabled?: boolean }

export function ProgressRewards({ data, recentBadges = [], enabled = true }: HarvestProps) {
    const { t } = useLanguage();
    const stickers = data?.weeklyNew ?? [];
    const badges = recentBadges.filter(badge => REWARD_BADGES.some(definition => definition.id === badge.id));
    if (!enabled || (!stickers.length && !badges.length)) return null;
    return <section className="space-y-3" aria-label={t.rewards.weeklyHarvest}>
        <div className="flex items-center justify-between gap-3">
            <h2 className="font-title text-xl font-semibold">{t.rewards.weeklyHarvest}</h2>
            <Link href="/collection" className="inline-flex min-h-11 shrink-0 items-center text-sm text-primary underline underline-offset-4">
                {t.nav.collection}<ChevronRight aria-hidden="true" className="size-4" />
            </Link>
        </div>
        {!!stickers.length && <div className="flex flex-wrap gap-3">
            {stickers.map(sticker => <KnowledgeSticker key={sticker.key} name={sticker.name}
                subject={sticker.subjectKey === 'english' || sticker.subjectKey === 'math' || sticker.subjectKey === 'chinese' ? sticker.subjectKey : 'other'}
                {...(sticker.state === 'missing' ? { state: 'missing', remaining: sticker.remaining } : { state: sticker.state })} />)}
        </div>}
        {!!badges.length && <div className="flex flex-wrap gap-4">
            {badges.map(badge => <Link key={badge.id} href="/collection?tab=badges" className="inline-flex min-h-11 min-w-11 rounded-md p-1 focus-visible:outline-2 focus-visible:outline-ring">
                <BadgeStamp badgeId={badge.id} earned size="sm" />
            </Link>)}
        </div>}
    </section>;
}
