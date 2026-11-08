"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewActionBar } from "@/components/review/review-action-bar";
import { PracticeResultPicker } from "@/components/practice-result-picker";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { frontendLogger } from "@/lib/frontend-logger";
import type { ReviewConfidence } from "@/lib/review-schedule";
import type { PracticeRecordResponse, PracticeResult } from "@/types/api";

interface PracticeResultCardProps {
    errorItemId: string;
    /** 根据用户答案自动判题得到的建议结果 */
    suggested: PracticeResult | null;
    question: { questionText: string; answerText: string; analysis: string; subject?: string; figureSvg?: string | null };
    difficulty: string;
    userAnswer: string;
    answerImage?: string;
    recognizedAnswer?: string;
    notes: string;
    gradeReason: string | null;
    source?: 'practice' | 'review';
    durationSec?: number;
    onSaved?: (record: PracticeRecordResponse) => void;
    onBusyChange?: (busy: boolean) => void;
    disabled?: boolean;
}

/** 原题复习或举一反三结束后，由用户确认结果并保存。 */
export function PracticeResultCard({ errorItemId, suggested, question, difficulty, userAnswer, answerImage, recognizedAnswer, notes, gradeReason, source = 'practice', durationSec, onSaved, onBusyChange, disabled = false }: PracticeResultCardProps) {
    const { t } = useLanguage();
    const [result, setResult] = useState<PracticeResult | null>(suggested);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 提交后的指针或触屏悬停可能停留在原位置；判题失败时不以悬停底色暗示推荐结果。
    const neutralReviewClass = suggested === null
        ? 'hover:bg-background hover:text-foreground hover:border-foreground/30 dark:bg-background dark:hover:bg-background'
        : undefined;
    const lock = useRef(false);
    const handleSave = async (chosen = result, confidence?: ReviewConfidence) => {
        if (!chosen || lock.current || saving || saved || disabled) return;
        lock.current = true;
        setSaving(true);
        onBusyChange?.(true);
        setError(null);
        try {
            const record = await apiClient.post<PracticeRecordResponse>("/api/practice/record", {
                errorItemId,
                result: chosen,
                source,
                ...(source === 'review' && durationSec !== undefined ? { durationSec } : {}),
                ...(source === 'review' && chosen === 'correct' ? { confidence: confidence ?? 'unsure' } : {}),
                ...(onSaved ? { includeReviewPlan: true } : {}),
                ...(source === 'practice' ? {
                    difficulty,
                    subject: question.subject || null,
                    questionText: question.questionText,
                    answerText: question.answerText,
                    analysis: question.analysis,
                    figureSvg: question.figureSvg ?? null,
                } : {}),
                userAnswer: userAnswer || null,
                ...(answerImage ? { answerImage } : {}),
                ...(recognizedAnswer ? { recognizedAnswer } : {}),
                notes: notes || null,
                gradeReason,
            });
            setSaved(true);
            onSaved?.(record);
        } catch (err) {
            frontendLogger.error('[Practice]', '保存作答结果失败', {
                error: getErrorMessage(err),
            });
            setError(t.mastery.resultSaveFailed);
        } finally {
            lock.current = false;
            setSaving(false);
            onBusyChange?.(false);
        }
    };

    if (source === 'review') return <ReviewActionBar label={t.mastery.markResult} busy={saving}
        className="space-y-3 lg:landscape:rounded-xl lg:landscape:border lg:landscape:p-4">
        <p className="text-center text-sm text-muted-foreground">{t.review.confirmNext}</p>
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3">
            <Button className={cn("min-h-11", neutralReviewClass)} variant="outline" disabled={disabled || saving || saved}
                onClick={() => void handleSave('correct', 'unsure')}>{t.review.correctUnsure}</Button>
            <Button className={cn("min-h-11", neutralReviewClass)} variant={suggested === 'correct' ? 'default' : 'outline'} disabled={disabled || saving || saved}
                onClick={() => void handleSave('correct', 'sure')}>{t.review.correctSure}</Button>
            <Button className={cn("col-span-2 min-h-11", neutralReviewClass)} variant={suggested === 'wrong' ? 'default' : 'outline'} disabled={disabled || saving || saved}
                onClick={() => void handleSave('wrong')}>{suggested === 'correct' ? t.review.actuallyWrong : t.review.wrong}</Button>
        </div>
        {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
    </ReviewActionBar>;

    return (
        <Card className={saved ? "border-green-500" : "border-primary/40"}>
            <CardHeader>
                <CardTitle className="text-base">{t.mastery.markResult}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <PracticeResultPicker value={result} onChange={setResult} disabled={saved || saving} allowNotAttempted={!onSaved} />
                {suggested && !saved && (
                    <p className="text-xs text-muted-foreground">{t.mastery.suggested}</p>
                )}
                {saved ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-green-700 dark:text-green-300">
                        <span className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" />
                            {t.mastery.resultSaved}
                        </span>
                        <Link href={`/error-items/${errorItemId}`} className="text-primary hover:underline sm:ml-auto">
                            {t.mastery.viewQuestion}
                        </Link>
                    </div>
                ) : (
                    <Button onClick={() => void handleSave()} disabled={!result || saving} className="w-full sm:w-auto">
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {t.mastery.saveResult}
                    </Button>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
        </Card>
    );
}
