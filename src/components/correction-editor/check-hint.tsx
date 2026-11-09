"use client";

import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { checkQuestionRules } from "@/lib/question/check-rules";
import type { QuestionCheckInput } from "@/lib/question/check-rules";

interface CheckHintProps {
    question: QuestionCheckInput;
}

/** 只有用户可见的问题才占据一行；检查通过时不增加任何界面。 */
export function CheckHint({ question }: CheckHintProps) {
    const { t } = useLanguage();
    const visible = checkQuestionRules(question).some((issue) => issue.visibility === "user");
    if (!visible) return null;
    return (
        <p role="status" className="mt-2 flex items-start gap-1 text-xs text-amber-800 dark:text-amber-300" data-testid="question-check-hint">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{t.questionCheck.missingFigure} {t.questionCheck.addImageHint}</span>
        </p>
    );
}
