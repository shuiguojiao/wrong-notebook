"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import { formatDateTime } from "@/lib/date-time";
import type { ExamAttemptSummary } from "@/types/api";

interface AttemptHistoryProps { paperId: string; attempts: ExamAttemptSummary[] }

export function AttemptHistory({ paperId, attempts }: AttemptHistoryProps) {
    const { t } = useLanguage();
    const { timeZone } = useTimeZone();
    const chronological = [...attempts].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
    return (
        <section className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold">{t.examAttempt.history}</h2>
                {chronological.length === 0 && <p className="text-sm text-muted-foreground">{t.examAttempt.noHistory}</p>}
            </div>
            {chronological.length > 0 && (
                <ul className="divide-y rounded-md border bg-card">
                    {chronological.map((attempt, index) => (
                        <li key={attempt.id}>
                            <Link
                                href={`/exams/${paperId}/attempts/${attempt.id}`}
                                className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 p-3 focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="font-medium">{t.exam.attemptLabel.replace('{n}', String(index + 1))}</span>
                                <time dateTime={attempt.submittedAt ?? attempt.startedAt} className="text-sm">
                                    {formatDateTime(attempt.submittedAt ?? attempt.startedAt, 'yyyy-MM-dd', timeZone)}
                                </time>
                                <span className="text-sm">{t.examAttempt.kinds[attempt.kind]}</span>
                                <span className="text-sm">{t.examAttempt.correctCount.replace('{count}', String(attempt.correctCount))}</span>
                                <span className="text-sm text-muted-foreground sm:ml-auto">{t.examAttempt.statuses[attempt.status]}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
