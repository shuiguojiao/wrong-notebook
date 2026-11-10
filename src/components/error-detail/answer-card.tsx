"use client";

import { AnswerCompare } from "@/components/question/answer-compare";
import { useLanguage } from "@/contexts/LanguageContext";
import { getMistakeStatusLabel } from "@/lib/question/mistake-status";
import type { AnswerCompareRow } from "@/components/question/answer-compare";
import type { ErrorItemDetail } from "./types";
import styles from "./detail-layout.module.css";

interface AnswerCardProps { item: ErrorItemDetail }

export function AnswerCard({ item }: AnswerCardProps) {
    const { t, language } = useLanguage();
    const rows: AnswerCompareRow[] = [];
    if (item.wrongAnswerText?.trim() || item.wrongAnswerImageUrl) {
        rows.push({ kind: "wrong", content: item.wrongAnswerText, image: item.wrongAnswerImageUrl });
    }
    rows.push({ kind: "standard", label: t.detail.correctAnswerLabel, content: item.answerText, image: item.referenceImageUrl });
    return <section aria-label={t.detail.correctAnswerLabel} className={`${styles.answers} border-t pt-5`}>
        <AnswerCompare variant="plain" rows={rows} />
        {/* 错题默认就是做错了，只有“未作答”“未知”等其他状态才提示 */}
        {item.mistakeStatus && item.mistakeStatus !== "wrong_attempt" && <p className="mt-2 px-1 text-xs text-muted-foreground">{t.editor.mistakeStatus} · {getMistakeStatusLabel(item.mistakeStatus, language)}</p>}
    </section>;
}
