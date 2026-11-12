"use client";

import type { CSSProperties } from 'react';
import { BadgeArt } from '@/components/student/badge-art';
import { useLanguage } from '@/contexts/LanguageContext';
import { badgeArtTilt } from '@/lib/rewards/badge-art';
import { REWARD_BADGES } from '@/lib/rewards/badges';
import { cn } from '@/lib/utils';

interface BadgeStampProps { badgeId: string; earned: boolean; size?: 'sm' | 'md'; animate?: boolean }

export function BadgeStamp({ badgeId, earned, size = 'md', animate = false }: BadgeStampProps) {
    const { t } = useLanguage();
    const badge = REWARD_BADGES.find(entry => entry.id === badgeId);
    if (!badge) return null;
    const concealed = badge.hidden && !earned;
    const name = concealed ? t.rewards.badgeHidden : t.rewards.badgeNames[badge.nameKey];
    const tilt = { '--badge-tilt': `${badgeArtTilt(badge.id)}deg` } as CSSProperties;
    return <span className={cn('inline-flex min-w-0 max-w-full flex-col items-center gap-2 text-center', size === 'sm' ? 'w-20' : 'w-28')} data-badge-id={badge.id}>
        <span role="img" aria-label={name} data-size={size} data-earned={earned} data-category={badge.category} style={tilt}
            className={cn('student-badge', animate && earned && 'student-badge-new')}>
            <BadgeArt badgeId={badge.id} category={badge.category} earned={earned} concealed={concealed} />
        </span>
        <span className={cn('line-clamp-2 max-w-full break-words text-xs', size === 'sm' && 'text-[11px]')}>{name}</span>
        {!earned && !concealed && <span className="max-w-full break-words text-xs text-muted-foreground">{t.rewards.badgeConditions[badge.nameKey]}</span>}
    </span>;
}
