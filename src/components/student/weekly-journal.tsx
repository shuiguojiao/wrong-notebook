"use client";

import Link from 'next/link';
import { Check, Star } from 'lucide-react';
import { QuestionSummary } from '@/components/error-list/question-summary';
import { BadgeStamp } from '@/components/student/badge-stamp';
import { EnergyBean } from '@/components/student/energy-bean';
import { NetworkNotice } from '@/components/student/network-notice';
import { PaperCard } from '@/components/student/paper-card';
import { ProgressStamp } from '@/components/student/progress-stamp';
import { StudentSkeleton } from '@/components/student/student-skeleton';
import { FunStickerArt } from '@/components/student/fun-sticker-art';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStatsData } from '@/lib/hooks/use-stats-data';
import { FUN_STICKERS } from '@/lib/rewards/fun-stickers';
import type { RewardWeekResponse } from '@/types/api';

interface WeeklyJournalProps { start: string; summary?: boolean; hideEmpty?: boolean }
interface WeeklyJournalContentProps { data: RewardWeekResponse; summary?: boolean }

export function WeeklyJournalContent({ data, summary = false }: WeeklyJournalContentProps) {
    const { t, language } = useLanguage();
    if (data.empty) return <p>{t.rewards.journalEmpty}</p>;
    const date = (day: string) => new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
    const stats = [[t.rewards.journalDays, data.reviewDays], [t.rewards.journalAnswered, data.answered], [t.rewards.journalCorrections, data.corrections], [t.rewards.journalBrave, data.braveAnswers]] as const;
    const fun = FUN_STICKERS.filter(sticker => data.funStickers.includes(sticker.id));
    const earned = data.beans !== 0 || data.badges.length > 0 || data.stickers.length > 0 || fun.length > 0;
    return <section aria-label={t.rewards.journalTitle} className="space-y-5">
        <div><h2 className="font-title text-xl font-semibold">{t.rewards.journalTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.rewards.journalRange.replace('{start}', date(data.start)).replace('{end}', date(data.end))}</p></div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(([label, value], index) => <div key={label} className="rounded-lg bg-muted/60 p-3">
                <dt className="text-sm font-medium">{label.split('{count}')[0]}<strong className="text-2xl tabular-nums">{value}</strong>{label.split('{count}')[1]}</dt>
                {index === 0 && <dd className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">{t.rewards.journalGoal.replace('{days}', String(data.goalDays))}
                    {data.goalReached && <Check aria-label={t.rewards.weeklyReached} className="size-5 rounded border border-primary text-primary" />}</dd>}
            </div>)}
        </dl>
        {summary ? <Link href={`/history?journal=${data.start}`} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{t.rewards.journalOpen}</Link> : <>
            {earned && <div className="space-y-3"><h3 className="font-title font-semibold">{t.rewards.journalEarned}</h3>
                <div className="flex flex-wrap items-center gap-3">
                    {data.beans !== 0 && <span className="inline-flex items-center gap-1"><EnergyBean />{t.rewards.bean} {t.rewards.beans.replace('{count}', String(data.beans))}</span>}
                    {data.badges.map(id => <BadgeStamp key={id} badgeId={id} earned size="sm" />)}
                    {data.stickers.map((name, index) => <span key={`${index}:${name}`} className="rounded border bg-card px-2 py-1 text-sm">{name}</span>)}
                    {fun.map(sticker => <span key={sticker.id} role="img" aria-label={t.rewards.funNames[sticker.nameKey as keyof typeof t.rewards.funNames]} className="shrink-0"><FunStickerArt id={sticker.id} size={40} /></span>)}
                </div>
            </div>}
            {data.bravest && <Link href={`/error-items/${encodeURIComponent(data.bravest.errorItemId)}`} className="block space-y-3 rounded-lg border p-4 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
                <h3 className="font-title font-semibold">{t.rewards.bravestMoment}</h3>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span role="img" aria-label={t.rewards.braveStars.replace('{n}', String(data.bravest.difficultyStars))} className="flex text-primary">{Array.from({ length: data.bravest.difficultyStars }, (_, index) => <Star key={index} className="size-4 fill-current" aria-hidden="true" />)}</span>
                    <span>{data.bravest.subjectName ?? t.review.subjectUnknown}</span><time dateTime={data.bravest.day}>{date(data.bravest.day)}</time>
                </div>
                <QuestionSummary text={data.bravest.preview} maxLength={120} className="line-clamp-3 break-words" />
                <ProgressStamp variant={data.bravest.result === 'correct' ? 'correct' : 'almost'} />
            </Link>}
        </>}
    </section>;
}

export function WeeklyJournal({ start, summary = false, hideEmpty = false }: WeeklyJournalProps) {
    const { data, loading, error, reload } = useStatsData<RewardWeekResponse>(`/api/rewards/week?start=${encodeURIComponent(start)}`);
    if (loading) return <StudentSkeleton variant="block" className="h-48" />;
    if (error) return <NetworkNotice onRetry={reload} />;
    return data && !(hideEmpty && data.empty) ? <PaperCard><WeeklyJournalContent data={data} summary={summary} /></PaperCard> : null;
}
