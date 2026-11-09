"use client";

import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SourceThumb } from "@/components/question/source-thumb";
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
}

const rowColors = {
    mine: "border-l-blue-500 dark:border-l-blue-400",
    previous: "border-l-red-500 dark:border-l-red-400",
    wrong: "border-l-red-500 dark:border-l-red-400",
    standard: "border-l-green-600 dark:border-l-green-400",
};

export function AnswerCompare({ rows, className }: AnswerCompareProps) {
    const { t } = useLanguage();
    const labels = {
        mine: t.app.yourAnswer,
        previous: t.review.previousAnswer,
        standard: t.review.standardAnswer,
        wrong: t.answerCompare.wrongAnswer,
    };
    return (
        <dl className={cn("space-y-5 rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-6", className)}>
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
    );
}
