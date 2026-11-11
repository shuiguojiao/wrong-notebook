"use client";

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { readRewardSeen, writeRewardSeen } from '@/lib/rewards/device-state';
import type { RewardSummaryResponse } from '@/types/api';

interface StreakNoticeProps { leave: RewardSummaryResponse['leave'] }

export function StreakNotice({ leave }: StreakNoticeProps) {
    const { t } = useLanguage();
    const [notice, setNotice] = useState<'used' | 'earned' | null>(null);
    const processed = useRef('');
    useEffect(() => {
        const key = JSON.stringify([leave.usedDay, leave.earnedDay]);
        if (processed.current === key) return;
        processed.current = key;
        const used = leave.usedDay && !readRewardSeen(`leave-used:${leave.usedDay}`);
        const earned = leave.earnedDay && !readRewardSeen(`leave-earned:${leave.earnedDay}`);
        setNotice(used ? 'used' : earned ? 'earned' : null);
        if (leave.usedDay) writeRewardSeen(`leave-used:${leave.usedDay}`);
        if (leave.earnedDay) writeRewardSeen(`leave-earned:${leave.earnedDay}`);
    }, [leave.usedDay, leave.earnedDay]);
    return notice ? <p role="status" className="student-streak-notice text-xs text-muted-foreground">{notice === 'used' ? t.rewards.leaveUsed : t.rewards.leaveEarned}</p> : null;
}
