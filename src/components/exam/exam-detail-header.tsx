"use client";

import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { ExamStatusBadge } from "@/components/exam/exam-status-badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import { formatDateTime } from "@/lib/date-time";
import { examPaperCode } from "@/lib/exam/exam-print";
import { formatExamScore, summarizeExamScores } from "@/lib/exam/exam-score";
import type { ExamPaperDetail } from "@/types/api";

interface ExamDetailHeaderProps { paper: ExamPaperDetail }

export function ExamDetailHeader({ paper }: ExamDetailHeaderProps) {
    const { t } = useLanguage();
    const { timeZone } = useTimeZone();
    const ready = paper.questions.filter(question => question.status === 'ready');
    const recorded = paper.questions.some(question => question.attempts.length > 0);
    const scores = summarizeExamScores(ready.map(question => question.score));
    return (
        <div className="flex items-start gap-3">
            <BackButton fallbackUrl="/exams" className="-ml-2 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
                <h1 className="break-words text-xl font-bold tracking-tight sm:text-2xl">{paper.title}</h1>
                <p className="text-xs text-muted-foreground">{t.exam.paperCode.replace("{code}", examPaperCode(paper.id))}</p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <ExamStatusBadge status={paper.status} recorded={recorded} />
                    {paper.mode === 'original' && <Badge variant="secondary">{t.exam.modes.original}</Badge>}
                    <span>{t.exam.progress.replace('{ready}', String(ready.length)).replace('{total}', String(paper.questions.length))}</span>
                    {scores.total !== null && (
                        <span>
                            {t.exam.totalScore.replace('{total}', formatExamScore(scores.total))}
                            {scores.unscored > 0 && <span className="text-xs">（{t.exam.totalScoreUnscored.replace('{count}', String(scores.unscored))}）</span>}
                        </span>
                    )}
                    <span>{formatDateTime(paper.createdAt, 'yyyy-MM-dd HH:mm', timeZone)}</span>
                </div>
            </div>
        </div>
    );
}
