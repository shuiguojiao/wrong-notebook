"use client";

import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SourceThumb } from "@/components/question/source-thumb";
import { PaperCard } from "@/components/student/paper-card";
import { ProgressStamp } from "@/components/student/progress-stamp";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export interface AnswerCompareRow {
    kind: "mine" | "previous" | "standard" | "wrong";
    label?: string;
    content?: string | null;
    image?: string | null;
}

interface AnswerCompareProps {
    rows: readonly AnswerCompareRow[];
    className?: string;
    variant?: "card" | "plain";
    result?: "correct" | "wrong" | null;
    gradeReason?: string | null;
}

const rowColors = {
    mine: "border-l-blue-500 dark:border-l-blue-400",
    previous: "border-l-red-500 dark:border-l-red-400",
    wrong: "border-l-red-500 dark:border-l-red-400",
    standard: "border-l-green-600 dark:border-l-green-400",
};

export function AnswerCompare({ rows, className, variant = "card", result, gradeReason }: AnswerCompareProps) {
    const { t, language } = useLanguage();
    const labels = {
        mine: result === undefined ? t.app.yourAnswer : t.student.youWrote,
        previous: t.review.previousAnswer,
        standard: result === undefined ? t.review.standardAnswer : t.student.referenceAnswer,
        wrong: t.answerCompare.wrongAnswer,
    };
    const reason = gradeReason?.trim();
    const summary = reason
        ? Array.from(new Intl.Segmenter(language, { granularity: "sentence" }).segment(reason))[0]?.segment.trim()
        : undefined;
    return (
        <div className="space-y-4">
            {result && <div className="flex justify-end"><ProgressStamp variant={result === "correct" ? "correct" : "almost"} /></div>}
            <dl className={cn("space-y-5 text-card-foreground", variant === "card" && "rounded-xl border bg-card p-4 shadow-xs sm:p-6", className)}>
                {rows.map(({ kind, label, content, image }, index) => (
                    <div key={index} data-kind={kind} className={cn("grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-3 border-l-[3px] pl-3", rowColors[kind])}>
                        <dt className="break-words text-sm font-medium leading-6">{label?.trim() || labels[kind]}</dt>
                        <dd className="min-w-0 space-y-2 text-sm leading-6">
                            {content?.trim() && <MarkdownRenderer content={content} className="break-words [&>p:last-child]:mb-0" />}
                            {image?.trim() && <SourceThumb src={image} alt={label?.trim() || labels[kind]} />}
                            {!content?.trim() && !image?.trim() && <p className="text-muted-foreground">{t.answerCompare.empty}</p>}
                        </dd>
                    </div>
                ))}
            </dl>
            {reason && <PaperCard variant="note" className="border-yellow-300 bg-yellow-100 text-yellow-950 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-100">
                <MarkdownRenderer content={summary || reason} className="line-clamp-3 text-sm [&>p:last-child]:mb-0" />
                <details className="mt-2 text-sm">
                    <summary className="min-h-11 cursor-pointer py-3">{t.review.gradeReason}</summary>
                    <MarkdownRenderer content={reason} />
                </details>
            </PaperCard>}
        </div>
    );
}
