"use client";

import { DifficultyStars } from "@/components/difficulty-stars";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { QuestionMeta } from "@/components/question/question-meta";
import { SourceThumb } from "@/components/question/source-thumb";
import { useLanguage } from "@/contexts/LanguageContext";
import { QuestionFigure } from "@/components/question-figure";
import { getItemTags } from "./types";
import type { ErrorItemDetail } from "./types";

interface QuestionCardProps {
    item: ErrorItemDetail;
    onDifficultyChange: (value: number | null) => void;
    savingDifficulty: boolean;
}

export function sourceCaption(source: string | null | undefined) {
    return source?.trim().split(/\n\s*\n/)[0]?.trim();
}

/** 题干、配图与出处按阅读顺序排列，管理操作统一放进菜单。 */
export function QuestionCard({ item, onDifficultyChange, savingDifficulty }: QuestionCardProps) {
    const { t } = useLanguage();
    const source = sourceCaption(item.source);
    const caption = source ? t.detail.sourceLabel.replace("{source}", source) : undefined;
    return (
        <section aria-label={t.detail.question} className="min-w-0 space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-6">
            <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                <QuestionMeta questionType={item.questionType ? t.questionType.names[item.questionType] || item.questionType : null} grade={item.gradeSemester} />
                {(item.questionType || item.gradeSemester) && <span aria-hidden="true">·</span>}
                <DifficultyStars value={item.difficultyStars} onChange={onDifficultyChange} disabled={savingDifficulty} className="[&_button]:min-h-8 [&_button]:min-w-6" />
            </div>
            <MarkdownRenderer content={item.questionText} className="text-[17px] leading-[1.75]" />
            {/* 配图比例与位置的调整在编辑模式中进行，浏览时只显示配图 */}
            <QuestionFigure svg={item.figureSvg} scale={item.figureScale} align={item.figureAlign} />
            <div className="lg:hidden">
                {item.originalImageUrl
                    ? <SourceThumb errorItemId={item.id} src={item.originalImageUrl} alt={t.detail.originalProblem} size="inline" caption={caption} />
                    : caption && <p className="text-[13px] text-muted-foreground">{caption}</p>}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-primary">
                {getItemTags(item).map(tag => <span key={tag}>#{tag}</span>)}
            </div>
        </section>
    );
}
