"use client";

import { Fragment } from "react";
import { DifficultyStars } from "@/components/difficulty-stars";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface QuestionMetaProps {
    questionType?: string | null;
    grade?: string | null;
    difficulty?: number | null;
    wrongCount?: number | null;
    fragments?: readonly (string | null | undefined)[];
    className?: string;
}

export function QuestionMeta({ questionType, grade, difficulty, wrongCount, fragments = [], className }: QuestionMetaProps) {
    const { t } = useLanguage();
    const segments = [
        questionType?.trim(),
        grade?.trim(),
        difficulty ? <DifficultyStars value={difficulty} showUnrated={false} /> : null,
        wrongCount != null ? t.questionMeta.wrongCount.replace("{count}", String(wrongCount)) : null,
        ...fragments.map(fragment => fragment?.trim()),
    ].filter(Boolean);

    if (!segments.length) return null;
    return (
        <div className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground", className)}>
            {segments.map((segment, index) => (
                <Fragment key={index}>
                    {index > 0 && <span aria-hidden="true">·</span>}
                    <span className="inline-flex items-center">{segment}</span>
                </Fragment>
            ))}
        </div>
    );
}
