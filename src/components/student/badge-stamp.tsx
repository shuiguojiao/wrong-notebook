"use client";

import { CalendarDays, Check, Shield, Star } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { REWARD_BADGES } from '@/lib/rewards/badges';
import { cn } from '@/lib/utils';

interface BadgeStampProps { badgeId: string; earned: boolean; size?: 'sm' | 'md'; animate?: boolean }
const icons = { persistence: CalendarDays, courage: Shield, correction: Check, hidden: Star };

export function BadgeStamp({ badgeId, earned, size = 'md', animate = false }: BadgeStampProps) {
    const { t } = useLanguage();
    const badge = REWARD_BADGES.find(entry => entry.id === badgeId);
    if (!badge) return null;
    const concealed = badge.hidden && !earned;
    const name = concealed ? t.rewards.badgeHidden : t.rewards.badgeNames[badge.nameKey];
    const Icon = icons[badge.category];
    return <span className="inline-flex min-w-0 max-w-full flex-col items-center gap-2 text-center" data-badge-id={badge.id}>
        <span role="img" aria-label={name} data-size={size} data-earned={earned}
            className={cn('student-badge', animate && earned && 'student-badge-new')}>
            <span aria-hidden="true" className="student-badge-inner">
                {concealed ? <span className="text-2xl">?</span> : <><Icon className="size-4 shrink-0" /><span>{name}</span></>}
            </span>
        </span>
        {!earned && <span className="max-w-full break-words text-xs text-muted-foreground">{concealed ? name : t.rewards.badgeConditions[badge.nameKey]}</span>}
    </span>;
}
