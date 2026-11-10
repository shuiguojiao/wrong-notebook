"use client";

import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { NoteCard } from "@/components/student/note-card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ReviewQueueResponse, ReviewSessionItem } from "@/types/api";

interface ReviewHomeCardProps {
    items: ReviewSessionItem[];
    reviewedSubjects?: ReviewQueueResponse["reviewedSubjects"];
    onViewQuestions?: () => void;
    questionsOpen?: boolean;
}

export function ReviewHomeCard({ items, reviewedSubjects = [], onViewQuestions, questionsOpen }: ReviewHomeCardProps) {
    const { t } = useLanguage();
    const subjects = new Map<string, { name: string; count: number; seconds: number; completed: boolean }>();
    for (const item of items) {
        const key = item.subjectId ?? "";
        const existing = subjects.get(key);
        subjects.set(key, { name: item.subjectName || t.review.subjectUnknown, count: (existing?.count ?? 0) + 1, seconds: (existing?.seconds ?? 0) + (item.estimatedSec ?? 0), completed: false });
    }
    for (const subject of reviewedSubjects) {
        const key = subject.subjectId ?? "";
        if (!subjects.has(key)) subjects.set(key, { name: subject.subjectName || t.review.subjectUnknown, count: subject.count, seconds: 0, completed: true });
    }
    return <NoteCard tape rotation={-0.5}>
        <section className="space-y-4" aria-label={t.student.dueToday}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-title text-2xl">{t.student.dueToday}</h2>
                {items.length > 0 && <span>{t.review.limitCount.replace("{count}", String(items.length))}</span>}
            </div>
            <ul className="space-y-2">
                {[...subjects].map(([id, subject]) => {
                    const content = <>
                        <span role="img" aria-label={subject.completed ? t.student.subjectDone : t.student.subjectPending} className="flex size-6 shrink-0 items-center justify-center rounded-sm border-2 border-current bg-card">
                            {subject.completed && <Check aria-hidden="true" className="size-5" />}
                        </span>
                        <span className="min-w-0 flex-1 break-words font-medium">{subject.name} · {t.review.limitCount.replace("{count}", String(subject.count))}</span>
                        <span className="shrink-0 text-sm">{subject.completed ? t.student.subjectDone : t.review.approxMinutes.replace("{minutes}", String(Math.ceil(subject.seconds / 60)))}</span>
                        {id && !subject.completed && <ChevronRight aria-hidden="true" className="size-4 shrink-0" />}
                    </>;
                    return <li key={id}>
                        {id && !subject.completed ? <Link href={`/review/session?${new URLSearchParams({ subjectId: id, autostart: "1" })}`} className="-mx-2 flex min-h-14 items-center gap-3 rounded-md px-2 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{content}</Link> : <div className="flex min-h-14 items-center gap-3 py-2">{content}</div>}
                    </li>;
                })}
            </ul>
            {items.length > 0 && <>
                {onViewQuestions && <Button variant="link" className="min-h-11 px-0 text-current underline" onClick={onViewQuestions} aria-expanded={questionsOpen} aria-controls="today-questions">{t.student.seeQuestions.replace("{count}", String(items.length))}</Button>}
                <Button asChild className="min-h-14 w-full bg-primary text-primary-foreground shadow-nb-primary hover:bg-primary/90"><Link href="/review/session?autostart=1">{t.student.startReview}</Link></Button>
            </>}
        </section>
    </NoteCard>;
}
