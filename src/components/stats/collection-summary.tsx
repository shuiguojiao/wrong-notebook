"use client";

import Link from 'next/link';
import { NetworkNotice } from '@/components/student/network-notice';
import { PaperCard } from '@/components/student/paper-card';
import { StudentSkeleton } from '@/components/student/student-skeleton';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStatsData } from '@/lib/hooks/use-stats-data';
import type { StudentProgress } from '@/lib/student-progress';

interface CollectionSummaryProps { subjectId?: string }

export function CollectionSummary({ subjectId }: CollectionSummaryProps) {
    const { t } = useLanguage();
    const { data, loading, error, reload } = useStatsData<StudentProgress>('/api/student-progress');
    if (loading) return <StudentSkeleton variant="block" className="h-32" />;
    if (error) return <NetworkNotice onRetry={reload} />;
    if (!data) return null;
    const stickers = data.stickers.filter(sticker => !subjectId || sticker.subjectId === subjectId);
    return <PaperCard><div className="space-y-3">
        <h3 className="font-title text-xl">{t.nav.collection}</h3>
        <p>{t.student.collectionCount.replace('{earned}', String(stickers.filter(sticker => sticker.state === 'earned').length)).replace('{total}', String(stickers.length))}</p>
        <p className="text-sm text-muted-foreground">{t.student.collectionSummaryHint}</p>
        <Link href="/collection" className="inline-flex min-h-11 items-center text-primary underline">{t.student.openCollection}</Link>
    </div></PaperCard>;
}
