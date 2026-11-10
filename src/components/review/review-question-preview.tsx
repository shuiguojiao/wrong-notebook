"use client";

import { QuestionSummary } from '@/components/error-list/question-summary';
import { REVIEW_PREVIEW_MAX_LENGTH } from '@/lib/question/review-preview';
import type { ReviewSessionItem } from '@/types/api';

interface ReviewQuestionPreviewProps {
    item?: ReviewSessionItem;
    fallback: string;
}

/** 今日清单和收工页共用公式摘要，旧快照仍显示原纯文本。 */
export function ReviewQuestionPreview({ item, fallback }: ReviewQuestionPreviewProps) {
    const className = 'min-w-0 max-w-full flex-1 overflow-x-auto break-words py-1';
    return item?.questionPreviewMarkdown
        ? <QuestionSummary text={item.questionPreviewMarkdown} maxLength={REVIEW_PREVIEW_MAX_LENGTH} className={className} />
        : <span className={className}>{item?.questionPreview || fallback}</span>;
}
