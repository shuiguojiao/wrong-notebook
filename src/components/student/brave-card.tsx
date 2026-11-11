"use client";

import Link from 'next/link';
import { Star } from 'lucide-react';
import { QuestionSummary } from '@/components/error-list/question-summary';
import { PaperCard } from '@/components/student/paper-card';
import { ProgressStamp } from '@/components/student/progress-stamp';
import { StudentSkeleton } from '@/components/student/student-skeleton';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { useRewards } from '@/lib/hooks/use-rewards';
import { REWARD_RULES } from '@/lib/rewards/rules';

interface BraveCardProps { rewards: ReturnType<typeof useRewards>; enabled?: boolean }

export function BraveCard({ rewards: { data, loading, error }, enabled = true }: BraveCardProps) {
    const { t } = useLanguage();
    if (!enabled || data?.enabled === false || error) return null;
    if (loading || !data) return <PaperCard className="min-h-72"><StudentSkeleton variant="block" className="h-60" /></PaperCard>;
    const brave = data.brave;
    if (!brave) return null;
    const subject = ['math', 'english', 'chinese'].includes(brave.subjectKey ?? '') ? brave.subjectKey : 'other';
    return <PaperCard className="student-brave-card min-h-72" data-subject={subject}>
        <section aria-label={t.rewards.braveTitle} className="space-y-3">
            <h2 className="font-title text-xl font-semibold">{t.rewards.braveTitle}</h2>
            <div role="img" aria-label={t.rewards.braveStars.replace('{n}', String(brave.difficultyStars))} className="flex gap-1 text-primary">
                {Array.from({ length: brave.difficultyStars }, (_, index) => <Star key={index} aria-hidden="true" className="size-4 fill-current" />)}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{brave.subjectName ?? t.review.subjectUnknown}</span>
                {brave.tags.slice(0, 3).map((tag, index) => <span key={`${index}:${tag}`} className="max-w-full break-words rounded-full border px-2 py-0.5">{tag}</span>)}
            </div>
            <QuestionSummary text={brave.preview} maxLength={60} className="line-clamp-2" />
            <p className="text-sm text-muted-foreground">{t.rewards.braveAsk.replace('{points}', String(REWARD_RULES.brave.points))}</p>
            {brave.done ? <div className="space-y-2">
                <p className="text-sm font-medium">{t.rewards.braveDone}</p>
                {brave.result && <ProgressStamp variant={brave.result === 'correct' ? 'correct' : 'almost'} />}
                {brave.result === 'wrong' && <p className="text-sm">{t.rewards.braveFall}</p>}
            </div> : <Button asChild className="min-h-11"><Link href="/review/session?mode=brave&autostart=1">{t.rewards.braveStart}</Link></Button>}
        </section>
    </PaperCard>;
}
