"use client";

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { KnowledgeSticker } from '@/components/student/knowledge-sticker';
import { ProgressStamp } from '@/components/student/progress-stamp';
import { useLanguage } from '@/contexts/LanguageContext';
import type { StudentProgress } from '@/lib/student-progress';

interface ProgressRewardsProps { data: StudentProgress }

export function StreakReward({ data }: ProgressRewardsProps) {
    const { t } = useLanguage();
    return <div className="shrink-0" title={data.reviewedToday ? undefined : t.student.streakContinue}>
        <ProgressStamp variant="streak" days={data.streak} className="student-today-streak" />
    </div>;
}

export function ProgressRewards({ data }: ProgressRewardsProps) {
    const { t } = useLanguage();
    if (!data.weeklyNew.length) return null;
    return <section className="space-y-3" aria-label={t.student.weeklyStickers}>
        <div className="flex items-center justify-between gap-3">
            <h2 className="font-title text-xl font-semibold">{t.student.weeklyStickers}</h2>
            <Link href="/collection" className="inline-flex min-h-11 shrink-0 items-center text-sm text-primary underline underline-offset-4">
                {t.nav.collection}<ChevronRight aria-hidden="true" className="size-4" />
            </Link>
        </div>
        <div className="flex flex-wrap gap-3">
            {data.weeklyNew.map(sticker => <KnowledgeSticker key={sticker.key} name={sticker.name}
                subject={sticker.subjectKey === 'english' || sticker.subjectKey === 'math' || sticker.subjectKey === 'chinese' ? sticker.subjectKey : 'other'}
                {...(sticker.state === 'missing' ? { state: 'missing', remaining: sticker.remaining } : { state: sticker.state })} />)}
        </div>
    </section>;
}
