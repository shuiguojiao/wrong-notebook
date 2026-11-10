"use client";

import Link from "next/link";
import { RecognizedAnswer } from "@/components/handwriting/recognized-answer";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SourceThumb } from "@/components/question/source-thumb";
import { QuestionFigure } from "@/components/question-figure";
import { useLanguage } from "@/contexts/LanguageContext";
import type { PracticeHistoryRecord } from "@/types/api";

interface PracticeRecordDetailProps {
    record: PracticeHistoryRecord;
}

/** 展开后的作答快照：用户作答、思路、判题依据与标准答案。 */
export function PracticeRecordDetail({ record }: PracticeRecordDetailProps) {
    const { t } = useLanguage();
    return (
        <div className="space-y-2 rounded-md bg-muted/40 p-3">
            <MarkdownRenderer content={record.questionText} />
            <QuestionFigure svg={record.figureSvg} />
            {record.wrongAnswerText && (
                <div className="border-t pt-2">
                    <p className="mb-1 font-medium">{record.source === "practice" || record.source === "review" ? t.app.yourAnswer : t.editor.wrongAnswerText}</p>
                    <MarkdownRenderer content={record.wrongAnswerText} />
                </div>
            )}
            {record.answerImageUrl && <SourceThumb src={record.answerImageUrl} alt={t.handwriting.answerImage} />}
            <RecognizedAnswer text={record.recognizedAnswer} />
            {record.notes && (
                <div className="border-t pt-2">
                    <p className="mb-1 font-medium">{t.practice.yourNotes}</p>
                    <p className="whitespace-pre-wrap">{record.notes}</p>
                </div>
            )}
            {record.gradeReason && (
                <p className="border-t pt-2 text-sm text-muted-foreground">
                    {t.practice.aiGradeReason.replace("{reason}", record.gradeReason)}
                </p>
            )}
            {record.mistakeAnalysis && (
                <div className="border-t pt-2">
                    <p className="mb-1 font-medium">{t.editor.mistakeAnalysis}</p>
                    <MarkdownRenderer content={record.mistakeAnalysis} />
                </div>
            )}
            {record.originalImageUrl && (
                // 作答图片可能来自上传的数据 URL，按原始比例显示。
                <img src={record.originalImageUrl} alt={t.editor.wrongAnswerText} className="max-h-96 max-w-full rounded object-contain" />
            )}
            {record.answerText && (
                <div className="border-t pt-2">
                    <MarkdownRenderer content={record.answerText} className="font-semibold" />
                </div>
            )}
            {record.exam && (
                <Link href={`/exams/${record.exam.paperId}`} className="text-xs text-primary hover:underline">
                    {record.exam.title}
                </Link>
            )}
        </div>
    );
}
