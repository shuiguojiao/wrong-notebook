"use client";

import { FigureScaleEditor } from "@/components/error-detail/figure-scale-editor";
import { AnswerSpaceControl } from "@/components/print-preview/answer-space-control";
import { PrintQuestionText } from "@/components/print-preview/print-question-text";
import { useLanguage } from "@/contexts/LanguageContext";
import { resolveQuestionAnswerSpacePx } from "@/lib/exam/exam-answer-space";
import type { AnswerSpaceMode } from "@/lib/exam/exam-answer-space";
import { formatExamScore } from "@/lib/exam/exam-score";
import type { FigureAlign } from "@/lib/figure-scale";
import type { ExamQuestionDetail } from "@/types/api";

interface ExamPrintQuestionProps {
    question: ExamQuestionDetail;
    /** 显示题号：不分组时为组内序号 + 1，分组时为全卷连续编号 */
    displayNumber: number;
    scoreUnit: string;
    answerSpace: AnswerSpaceMode;
    customSpaces: Record<string, number>;
    uniformPreview: { scale: number | null; align: FigureAlign | null };
    onSaveFigureScale: (questionId: string, figureScale: number, figureAlign: FigureAlign) => Promise<void>;
    onChangeCustomSpace: (questionId: string, px: number | null) => void;
}

/** 打印中的一道题目：题号与分值行、题干、配图与留白 */
export function ExamPrintQuestion({
    question,
    displayNumber,
    scoreUnit,
    answerSpace,
    customSpaces,
    uniformPreview,
    onSaveFigureScale,
    onChangeCustomSpace,
}: ExamPrintQuestionProps) {
    const { t } = useLanguage();
    return (
        <section className="exam-question">
            <div className="exam-question-head">
                <span>
                    <span className="exam-question-number">{displayNumber}.</span>
                    {typeof question.score === 'number' && `（${formatExamScore(question.score)} ${scoreUnit}）`}
                </span>
                <span className="exam-source">{t.exam.sourceLabel}: {question.sourceShortId}</span>
            </div>
            <PrintQuestionText content={question.questionText!} />
            <FigureScaleEditor
                key={`${question.id}-${question.figureScale ?? 100}-${question.figureAlign ?? "center"}`}
                svg={question.figureSvg}
                scale={question.figureScale}
                align={question.figureAlign}
                previewScaleOverride={uniformPreview.scale}
                previewAlignOverride={uniformPreview.align}
                onSave={(figureScale, figureAlign) => onSaveFigureScale(question.id, figureScale, figureAlign)}
            />
            {(() => {
                const effectivePx = resolveQuestionAnswerSpacePx(answerSpace, question.questionText!, customSpaces[question.id]);
                return (
                    <>
                        <div
                            className="exam-answer-space"
                            style={{ minHeight: `${effectivePx}px` }}
                        />
                        <AnswerSpaceControl
                            effectivePx={effectivePx}
                            isCustom={typeof customSpaces[question.id] === "number"}
                            onChange={(px) => onChangeCustomSpace(question.id, px)}
                            onReset={() => onChangeCustomSpace(question.id, null)}
                        />
                    </>
                );
            })()}
        </section>
    );
}

