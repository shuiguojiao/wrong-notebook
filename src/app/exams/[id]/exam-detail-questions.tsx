"use client";

import { ExamQuestionCard } from "@/components/exam/exam-question-card";
import { groupExamQuestions } from "@/lib/exam/exam-sections";
import type { ExamSection, ExamSectionItem } from "@/lib/exam/exam-sections";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ExamMode, ExamQuestionDetail } from "@/types/api";
import type { FigureAlign } from "@/lib/figure-scale";

interface ExamDetailQuestionsProps {
    paperId: string;
    paperMode: ExamMode;
    /** 是否按题型分大题显示 */
    groupByType: boolean;
    questions: ExamQuestionDetail[];
    onRegenerated: () => void;
    uniformPreview: { scale: number | null; align: FigureAlign | null };
    onSaveFigureScale: (questionId: string, figureScale: number, figureAlign: FigureAlign) => Promise<void>;
    onSaveScore: (questionId: string, score: number | null) => Promise<void>;
    settingsExpanded: boolean;
}

/** 大题标题行：题型名 + 题数与分值小计（未全部设分值时注明未设分值题数） */
function SectionHeader({ section }: { section: ExamSection<ExamQuestionDetail> }) {
    const { t } = useLanguage();
    const summary = section.scoreTotal !== null
        ? t.exam.sectionSummaryScored
            .replace("{count}", String(section.count))
            .replace("{total}", String(section.scoreTotal))
        : t.exam.sectionSummary.replace("{count}", String(section.count));
    return (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2 pt-4">
            <h2 className="text-base font-bold">{section.title}</h2>
            <span className="text-sm text-muted-foreground">
                {summary}
                {section.scoreTotal !== null && section.unscored > 0 && (
                    <span>（{t.exam.sectionSummaryUnscored.replace("{count}", String(section.unscored))}）</span>
                )}
            </span>
        </div>
    );
}

/** 按题型分大题时的分组题目列表 */
function GroupedQuestions({
    paperId,
    paperMode,
    sections,
    onRegenerated,
    uniformPreview,
    onSaveFigureScale,
    onSaveScore,
    settingsExpanded,
}: Omit<ExamDetailQuestionsProps, "groupByType" | "questions"> & {
    sections: ExamSection<ExamQuestionDetail>[];
}) {
    const renderQuestion = (item: ExamSectionItem<ExamQuestionDetail>) => (
        <ExamQuestionCard
            key={item.question.id}
            paperId={paperId}
            paperMode={paperMode}
            question={item.question}
            displayNumber={item.displayNumber}
            onRegenerated={onRegenerated}
            previewFigureScale={uniformPreview.scale}
            previewFigureAlign={uniformPreview.align}
            onSaveFigureScale={onSaveFigureScale}
            scoreEditable={settingsExpanded}
            onSaveScore={onSaveScore}
        />
    );
    return (
        <div className="space-y-3">
            {sections.map((section) => (
                <section key={section.title} className="space-y-3">
                    <SectionHeader section={section} />
                    {section.items.map(renderQuestion)}
                </section>
            ))}
        </div>
    );
}

/** 试卷详情页的题目列表，按排版设置决定分组与分值编辑状态。 */
export function ExamDetailQuestions({
    paperId,
    paperMode,
    groupByType,
    questions,
    onRegenerated,
    uniformPreview,
    onSaveFigureScale,
    onSaveScore,
    settingsExpanded,
}: ExamDetailQuestionsProps) {
    const { language } = useLanguage();
    const sections = groupByType
        ? groupExamQuestions(questions, language)
        : null;

    return (
        <div className="space-y-3">
            {sections ? (
                <GroupedQuestions
                    paperId={paperId}
                    paperMode={paperMode}
                    sections={sections}
                    onRegenerated={onRegenerated}
                    uniformPreview={uniformPreview}
                    onSaveFigureScale={onSaveFigureScale}
                    onSaveScore={onSaveScore}
                    settingsExpanded={settingsExpanded}
                />
            ) : (
                questions.map((question) => (
                    <ExamQuestionCard
                        key={question.id}
                        paperId={paperId}
                        paperMode={paperMode}
                        question={question}
                        onRegenerated={onRegenerated}
                        previewFigureScale={uniformPreview.scale}
                        previewFigureAlign={uniformPreview.align}
                        onSaveFigureScale={onSaveFigureScale}
                        scoreEditable={settingsExpanded}
                        onSaveScore={onSaveScore}
                    />
                ))
            )}
        </div>
    );
}
