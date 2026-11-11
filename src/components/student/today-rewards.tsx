"use client";

import Link from 'next/link';
import { EnergyBean } from '@/components/student/energy-bean';
import { StudentSkeleton } from '@/components/student/student-skeleton';
import { useLanguage } from '@/contexts/LanguageContext';
import type { useRewards } from '@/lib/hooks/use-rewards';
import { shiftDay } from '@/lib/rewards/rules';

interface TodayRewardsProps { rewards: ReturnType<typeof useRewards>; variant: 'balance' | 'week' }

export function TodayRewards({ rewards: { data, loading, error }, variant }: TodayRewardsProps) {
    const { t, language } = useLanguage();
    if (data?.enabled === false || error) return null;
    if (loading || !data) return <StudentSkeleton className={variant === 'balance' ? 'flex h-11 w-20 items-center' : 'h-11 w-full max-w-72'} />;
    if (variant === 'balance') return <Link href="/history" aria-label={t.rewards.balanceLabel.replace('{count}', String(data.balance))}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap rounded-md px-1 text-base font-medium tabular-nums hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
        <EnergyBean /><span>{data.balance}</span>
    </Link>;
    const reached = data.week.completedDays.length >= data.week.goalDays;
    return <Link href="/me#rewards" aria-label={t.rewards.weeklyProgress}
        className="flex min-h-11 w-fit max-w-full items-center gap-3 rounded-md py-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
        <span className="flex shrink-0 gap-2" role="list" aria-label={t.rewards.weeklyProgress}>
            {Array.from({ length: 7 }, (_, index) => {
                const day = shiftDay(data.week.start, index);
                const complete = data.week.completedDays.includes(day);
                const today = day === data.today.day;
                const label = complete ? t.rewards.dayComplete : today ? t.rewards.dayToday : day > data.today.day ? t.rewards.dayFuture : t.rewards.dayMissed;
                const date = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
                return <span key={day} role="listitem" aria-label={label.replace('{day}', date)} aria-current={today ? 'date' : undefined}
                    data-state={complete ? 'complete' : today ? 'today' : day > data.today.day ? 'future' : 'missed'}
                    className={`flex size-4 items-center justify-center rounded-full ${complete ? 'bg-primary/20' : today ? 'border-2 border-primary' : 'border border-border bg-muted'}`}>
                    {complete && <EnergyBean size={16} />}
                </span>;
            })}
        </span>
        <span className="text-xs text-muted-foreground">{reached ? t.rewards.weeklyDone : t.rewards.weeklyGoal.replace('{days}', String(data.week.goalDays))}</span>
    </Link>;
}
