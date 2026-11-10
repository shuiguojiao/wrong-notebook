"use client";

import Link from 'next/link';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { HistoryImages } from '@/components/history/history-images';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTimeZone } from '@/contexts/TimeZoneContext';
import { useStatsData } from '@/lib/hooks/use-stats-data';
import { formatHistoryDay } from '@/lib/practice-history-view';
import type { PracticeHistoryDay, PracticeRecordDetail } from '@/types/api';

interface HistoryDetailProps { id: string }

export function HistoryDetail({ id }: HistoryDetailProps) {
    const { language, t } = useLanguage();
    const { timeZone } = useTimeZone();
    const { data: record, loading, error, reload } = useStatsData<PracticeRecordDetail>(`/api/practice/record/${encodeURIComponent(id)}`);
    if (loading) return <HistorySkeleton />;
    if (error || !record) return <div role="alert">{t.history.loadFailed}<Button variant="ghost" onClick={reload}>{t.review.retry}</Button></div>;
    const source = record.source === 'practice' ? t.student.trySimilar : record.source === 'exam' ? t.nav.exams : record.source === 'manual' ? t.mastery.sources.manual : t.history.review;
    const timestamp = new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(record.createdAt));
    const duration = record.durationSec === null ? null : (record.durationSec < 60 ? t.history.durationSeconds : t.history.duration)
        .replace('{minutes}', String(Math.floor(record.durationSec / 60))).replace('{seconds}', String(record.durationSec % 60));
    return <article className="min-w-0 space-y-5" data-testid="history-detail">
        <p className="text-sm text-muted-foreground">{source} · <time dateTime={record.createdAt}>{timestamp}</time>{duration !== null && ` · ${duration}`}</p>
        <section aria-label={t.detail.question}><MarkdownRenderer content={record.questionText || t.history.questionUnavailable} />
            <HistoryImages svg={record.figureSvg} url={record.hasFigure && !record.figureSvg ? record.originalImageUrl : null} scale={record.figureScale} align={record.figureAlign} label={t.figure.alt} />
        </section>
        <section className="space-y-2 border-t pt-4"><h3 className="font-semibold">{t.history.myAnswer}</h3>
            <HistoryImages url={record.answerImageUrl} label={t.handwriting.answerImage} />
            <MarkdownRenderer content={record.userAnswer} />
            {!record.userAnswer && !record.answerImageUrl && <p className="text-sm text-muted-foreground">{record.result === 'not_attempted' ? t.history.notAttempted : t.history.answerUnavailable}</p>}
            {record.recognizedAnswer && <details><summary className="min-h-11 cursor-pointer py-3 text-sm">{t.handwriting.recognizedAnswer}</summary><MarkdownRenderer content={record.recognizedAnswer} /></details>}
        </section>
        <details className="border-t"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{t.student.referenceAnswer}</summary><MarkdownRenderer content={record.answerText} /><MarkdownRenderer content={record.analysis} /></details>
        {record.gradeReason && <section><h3 className="font-semibold">{t.history.gradeReason}</h3><MarkdownRenderer content={record.gradeReason} /></section>}
        <p className="text-sm">{t.history.confidence} · {record.confidence === 'sure' ? t.student.gotIt : record.confidence === 'unsure' ? t.student.notSureYet : t.history.notRecorded}</p>
        {record.errorItemId && <Button variant="outline" className="min-h-11" asChild><Link href={`/error-items/${encodeURIComponent(record.errorItemId)}`}>{t.history.openOriginal}</Link></Button>}
    </article>;
}

export function HistorySkeleton() {
    const { t } = useLanguage();
    return <div role="status" aria-label={t.common.loading} className="space-y-3 py-4">{[1, 2, 3].map(value => <div key={value} className="h-14 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}</div>;
}

export function HistoryDaySummary({ day }: { day?: PracticeHistoryDay }) {
    const { language, t } = useLanguage();
    const subjects = new Map<string, { total: number; correct: number; wrong: number }>();
    for (const record of day?.records ?? []) {
        const name = record.subjectName || t.review.subjectUnknown;
        const counts = subjects.get(name) ?? { total: 0, correct: 0, wrong: 0 };
        if (record.result === 'correct' || record.result === 'wrong') { counts.total++; counts[record.result]++; }
        subjects.set(name, counts);
    }
    return <section><h2 className="mb-3 font-title text-xl">{t.history.dayOverview}</h2>
        {day && <p className="mb-3 text-sm">{formatHistoryDay(day.date, language)}</p>}
        {subjects.size ? <ul className="space-y-3 text-sm">{[...subjects].map(([name, count]) => <li key={name}>{name} · {t.history.subjectSummary.replace('{count}', String(count.total)).replace('{correct}', String(count.correct)).replace('{wrong}', String(count.wrong))}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t.history.emptyDay}</p>}
    </section>;
}
