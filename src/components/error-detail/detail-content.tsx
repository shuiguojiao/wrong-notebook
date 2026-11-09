"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SourceThumb } from "@/components/question/source-thumb";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { AnalysisTabs } from "./analysis-tabs";
import { AnswerCard } from "./answer-card";
import { DetailActionBar } from "./detail-action-bar";
import { DetailMenu } from "./detail-menu";
import { EditMode } from "./edit-mode";
import { GeneratedContent } from "./generated-content";
import { QuestionCard, sourceCaption } from "./question-card";
import { ReviewSummary } from "./review-summary";
import type { ErrorItemDetail, UpdateErrorItem } from "./types";
import styles from "./detail-layout.module.css";

interface DetailContentProps {
    item: ErrorItemDetail;
    educationStage?: string;
    saveFields: (fields: Partial<ErrorItemDetail>) => Promise<void>;
    onUpdate: UpdateErrorItem;
    reload: () => Promise<void>;
    onDeleted: () => void;
    onDifficultyChange: (value: number | null) => void;
    savingDifficulty: boolean;
    svgEnabled: boolean;
    geogebraEnabled: boolean;
}

export function DetailContent(props: DetailContentProps) {
    const { item, educationStage, saveFields, onUpdate, reload, onDeleted } = props;
    const { t } = useLanguage();
    const [editing, setEditing] = useState(false);
    const source = sourceCaption(item.source);
    const caption = source ? t.detail.sourceLabel.replace("{source}", source) : undefined;
    const closeEdit = () => {
        setEditing(false);
        void reload();
    };
    return <main data-detail-layout className={`${styles.page} min-h-screen bg-muted/40`}>
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6" style={{ paddingBottom: "calc(var(--detail-action-height, 5rem) + 1.5rem)" }}>
            <h1 className="sr-only">{t.detail.title}</h1>
            {!editing && <header className="flex items-center justify-between">
                <Button asChild variant="ghost" size="icon" className="size-11"><Link href={item.subjectId ? `/notebooks/${item.subjectId}` : "/notebooks"} aria-label={t.common.back}><ArrowLeft className="size-5" aria-hidden="true" /></Link></Button>
                <DetailMenu item={item} onEdit={() => setEditing(true)} onUpdate={onUpdate} reload={reload} onDeleted={onDeleted} svgEnabled={props.svgEnabled} geogebraEnabled={props.geogebraEnabled} />
            </header>}
            {editing ? <EditMode item={item} educationStage={educationStage} saveFields={saveFields} onUpdate={onUpdate} onClose={closeEdit} /> : <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="min-w-0 space-y-4">
                    <QuestionCard item={item} onDifficultyChange={props.onDifficultyChange} savingDifficulty={props.savingDifficulty} />
                    <AnswerCard item={item} />
                    <AnalysisTabs item={item} />
                    <GeneratedContent item={item} svgEnabled={props.svgEnabled} geogebraEnabled={props.geogebraEnabled} onUpdate={onUpdate} />
                </div>
                <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
                    {(item.originalImageUrl || caption) && <div className="hidden rounded-xl border bg-card p-4 shadow-xs lg:block sm:p-6">
                        {item.originalImageUrl ? <SourceThumb src={item.originalImageUrl} alt={t.detail.originalProblem} caption={caption} className="[&_button_img]:max-h-[28rem]" /> : <p className="text-[13px] text-muted-foreground">{caption}</p>}
                    </div>}
                    <ReviewSummary id={item.id} revision={`${item.subjectId}:${item.questionType}`} />
                    <DetailActionBar desktopInline>
                        <Button asChild className="min-h-12 w-full"><Link href={`/practice?id=${item.id}`}>{t.detail.practice}</Link></Button>
                    </DetailActionBar>
                </aside>
            </div>}
        </div>
    </main>;
}
