"use client";

import { useEffect, useState } from 'react';
import { NetworkNotice } from '@/components/student/network-notice';
import { PaperCard } from '@/components/student/paper-card';
import { StudentSkeleton } from '@/components/student/student-skeleton';
import { WeeklyJournalContent } from '@/components/student/weekly-journal';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStatsData } from '@/lib/hooks/use-stats-data';
import { readRewardSeen, writeRewardSeen } from '@/lib/rewards/device-state';
import { shiftDay } from '@/lib/rewards/rules';
import type { RewardWeekResponse } from '@/types/api';

interface TodayJournalProps { weekStart: string }

export function TodayJournal({ weekStart }: TodayJournalProps) {
    return <TodayJournalWeek key={weekStart} start={shiftDay(weekStart, -7)} />;
}

function TodayJournalWeek({ start }: { start: string }) {
    const { t } = useLanguage();
    const [visible, setVisible] = useState(false);
    const key = `journal:${start}`;
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 首屏后读取设备上的翻页记录。
        setVisible(!readRewardSeen(key));
    }, [key]);
    return visible ? <PreviousJournal start={start} onDismiss={() => { writeRewardSeen(key); setVisible(false); }} label={t.rewards.journalDismiss} /> : null;
}

interface PreviousJournalProps { start: string; onDismiss: () => void; label: string }
function PreviousJournal({ start, onDismiss, label }: PreviousJournalProps) {
    const { data, loading, error, reload } = useStatsData<RewardWeekResponse>(`/api/rewards/week?start=${start}`);
    useEffect(() => {
        if (!loading && !error && data && !data.empty) writeRewardSeen(`journal:${start}`);
    }, [data, loading, error, start]);
    if (loading) return <StudentSkeleton variant="block" className="h-48" />;
    if (error) return <NetworkNotice onRetry={reload} />;
    if (!data || data.empty) return null;
    return <PaperCard>
        <div className="mb-2 flex justify-end"><Button variant="ghost" className="min-h-11" onClick={onDismiss}>{label}</Button></div>
        <WeeklyJournalContent data={data} summary />
    </PaperCard>;
}
