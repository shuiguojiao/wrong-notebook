"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { ExamFigureScaleBar } from "@/components/exam/exam-figure-scale-bar";
import { ExamScoreBar } from "@/components/exam/exam-score-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/contexts/LanguageContext";
import type { FigureAlign } from "@/lib/figure-scale";
import type { ExamQuestionDetail } from "@/types/api";

interface ExamLayoutSettingsProps {
    questions: ExamQuestionDetail[];
    groupByType: boolean;
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    onPreviewChange: (preview: { scale: number | null; align: FigureAlign | null }) => void;
    onSaveFigureScale: (patch: { figureScale?: number; figureAlign?: FigureAlign }) => Promise<void>;
    onSaveScore: (score: number | null) => Promise<void>;
    onSaveGroupByType: (groupByType: boolean) => Promise<void>;
}

/** 详情页次要出卷设置；隐藏面板时保留尚未保存的批量设置草稿。 */
export function ExamLayoutSettings({
    questions, groupByType, expanded, onExpandedChange, onPreviewChange,
    onSaveFigureScale, onSaveScore, onSaveGroupByType,
}: ExamLayoutSettingsProps) {
    const { t } = useLanguage();
    const panelId = useId();
    const triggerId = useId();
    const figureQuestions = questions.filter(question => question.status === "ready" && Boolean(question.figureSvg));
    return (
        <Card className="gap-0 py-0">
            <h2>
                <Button
                    id={triggerId}
                    type="button"
                    variant="ghost"
                    className="h-auto min-h-11 w-full justify-between gap-3 whitespace-normal px-4 py-3 text-left"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => onExpandedChange(!expanded)}
                >
                    {t.exam.layoutSettings}
                    <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 ${expanded ? "rotate-180" : ""}`} />
                </Button>
            </h2>
            <div id={panelId} role="region" aria-labelledby={triggerId} hidden={!expanded}>
                <CardContent className="space-y-3 border-t p-4">
                    {figureQuestions.length > 0 && (
                        <ExamFigureScaleBar
                            scales={figureQuestions.map(question => question.figureScale)}
                            aligns={figureQuestions.map(question => question.figureAlign)}
                            onPreviewChange={onPreviewChange}
                            onSave={onSaveFigureScale}
                        />
                    )}
                    <ExamScoreBar scores={questions.map(question => question.score)} onSave={onSaveScore} />
                    <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm" title={t.exam.groupByTypeHint}>
                        <Checkbox checked={groupByType} onCheckedChange={value => void onSaveGroupByType(value === true)} />
                        {t.exam.groupByType}
                    </label>
                </CardContent>
            </div>
        </Card>
    );
}
