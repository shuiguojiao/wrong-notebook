"use client";

import Link from 'next/link';
import { PenLine } from 'lucide-react';
import { QuestionSummary } from '@/components/error-list/question-summary';
import { ProgressStamp } from '@/components/student/progress-stamp';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTimeZone } from '@/contexts/TimeZoneContext';
import { formatDateTime } from '@/lib/date-time';
import { formatHistoryDay, groupHistorySources } from '@/lib/practice-history-view';
import { cn } from '@/lib/utils';
import type { PracticeHistoryDay, PracticeHistoryListRecord } from '@/types/api';

interface HistoryDayListProps { day: PracticeHistoryDay; selectedRecord: string; onSelect: (record: PracticeHistoryListRecord) => void }

export function HistoryDayList({ day, selectedRecord, onSelect }: HistoryDayListProps) {
    const { language, t } = useLanguage();
    const { timeZone } = useTimeZone();
    const dateLabel = formatHistoryDay(day.date, language);
    const summary = t.history.daySummary.replace('{count}', String(day.summary.total)).replace('{correct}', String(day.summary.correct));
    const sources: Record<string, string> = { review: t.history.review, practice: t.student.trySimilar, exam: t.nav.exams, manual: t.mastery.sources.manual };
    function rows(records: PracticeHistoryListRecord[]) {
        return <ul className="divide-y">{records.map(record => <li key={record.id}>
            <button type="button" data-record-id={record.id} aria-pressed={record.id === selectedRecord} onClick={() => onSelect(record)}
                className={cn('flex min-h-14 w-full items-center gap-2 rounded-md px-1 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring', record.id === selectedRecord && 'bg-muted ring-1 ring-inset ring-ring')}>
                {record.result === 'correct' || record.result === 'wrong' ? <ProgressStamp variant={record.result === 'correct' ? 'correct' : 'almost'} className="history-result-stamp shrink-0" /> : <span className="shrink-0 rounded border bg-muted px-2 py-1 text-xs text-muted-foreground">{t.history.notAttempted}</span>}
                {record.subjectName && <span className="student-sticker max-w-20 shrink-0 truncate rounded-full border bg-secondary px-2 py-1 text-xs text-secondary-foreground" title={record.subjectName}>{record.subjectName}</span>}
                <QuestionSummary text={record.preview || t.detail.question} maxLength={120} className="min-w-0 flex-1 truncate" />
                {record.hasAnswerImage && <PenLine aria-label={t.handwriting.answerImage} className="size-4 shrink-0" />}
                <time dateTime={record.createdAt} className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateTime(record.createdAt, 'HH:mm', timeZone)}</time>
            </button>
        </li>)}</ul>;
    }
    return <section data-history-date={day.date} className="space-y-3">
        <header className="sticky top-0 z-10 border-b bg-background py-3">
            <h2 className="font-title text-lg font-semibold">{dateLabel}</h2>
            <p className="text-sm text-muted-foreground">{summary}{day.summary.reviewDurationSec > 0 && ` · ${t.history.reviewMinutes.replace('{minutes}', String(Math.ceil(day.summary.reviewDurationSec / 60)))}`}</p>
        </header>
        {groupHistorySources(day.records).map(([key, group]) => group.source === 'exam' ? <details key={key} className="rounded-lg border px-3" open={group.records.some(record => record.id === selectedRecord) || undefined}>
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{t.history.paperSummary.replace('{title}', group.exam?.title ?? t.nav.exams).replace('{correct}', String(group.records.filter(record => record.result === 'correct').length)).replace('{count}', String(group.records.length))}</summary>
            {group.exam && <Link href={`/exams/${encodeURIComponent(group.exam.paperId)}`} className="inline-flex min-h-11 items-center text-sm text-primary underline">{t.history.openPaper}</Link>}
            {rows(group.records)}
        </details> : <div key={key} className="space-y-1"><h3 className="text-sm font-medium text-muted-foreground">{sources[group.source]}</h3>{rows(group.records)}</div>)}
    </section>;
}
