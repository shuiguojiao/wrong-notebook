"use client";

import { DifficultyStars } from "@/components/difficulty-stars";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { QuestionFigure } from "@/components/question-figure";
import { QuestionMeta } from "@/components/question/question-meta";
import { useLanguage } from "@/contexts/LanguageContext";
import { getChoiceAnswer } from "@/lib/answer-match";
import { splitChoiceOptions } from "@/lib/print/choice-options";
import { cn } from "@/lib/utils";
import { getItemTags } from "./types";
import type { ErrorItemDetail } from "./types";

interface QuestionCardProps {
    item: ErrorItemDetail;
}

export function sourceCaption(source: string | null | undefined) {
    return source?.trim().split(/\n\s*\n/)[0]?.trim();
}

/** 题干、选项与配图按阅读顺序排列，管理操作统一放进菜单。 */
export function QuestionCard({ item }: QuestionCardProps) {
    const { t } = useLanguage();
    const choices = splitChoiceOptions(item.questionText);
    const correctLetters = getChoiceAnswer((item.answerText ?? "").replace(/([A-H])（/g, "$1 ("));
    return (
        <section aria-label={t.detail.question} className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                <QuestionMeta questionType={item.questionType ? t.questionType.names[item.questionType] || item.questionType : null} grade={item.gradeSemester} />
                {(item.questionType || item.gradeSemester) && <span aria-hidden="true">·</span>}
                <span className="inline-flex items-center gap-1.5">
                    <span>{t.difficulty.label}</span>
                    <DifficultyStars value={item.difficultyStars} />
                </span>
            </div>
            <MarkdownRenderer content={choices?.stem ?? item.questionText} className="break-words text-[17px] leading-[1.75]" />
            {choices && <>
                <ul className={cn("grid gap-3", choices.columns !== 1 && "sm:grid-cols-2")}>
                    {choices.options.map(option => {
                        const letter = option.label.match(/[A-D]/)?.[0] ?? "";
                        const correct = !!letter && !!correctLetters?.includes(letter);
                        return <li key={option.label} data-correct={correct} className={cn("flex min-w-0 gap-3 rounded-md border p-3", correct && "border-green-600 bg-green-50 text-green-950 dark:border-green-400 dark:bg-green-950 dark:text-green-100")}>
                            <span className="shrink-0 text-sm">{letter}</span>
                            <MarkdownRenderer content={option.content} className="min-w-0 break-words [&>p:last-child]:mb-0" />
                            {correct && <span className="sr-only">{t.detail.correctAnswerLabel}</span>}
                        </li>;
                    })}
                </ul>
                {choices.after && <MarkdownRenderer content={choices.after} className="break-words" />}
            </>}
            {/* 配图比例与位置的调整在编辑模式中进行，浏览时只显示配图 */}
            <QuestionFigure svg={item.figureSvg} scale={item.figureScale} align={item.figureAlign} />
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-primary">
                {getItemTags(item).map(tag => <span key={tag}>#{tag}</span>)}
            </div>
        </section>
    );
}
