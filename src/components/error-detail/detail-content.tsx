"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SourceThumb } from "@/components/question/source-thumb";
import { PaperCard } from "@/components/student/paper-card";
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
import { getItemTags } from "./types";
import type { ErrorItemDetail, UpdateErrorItem } from "./types";
import styles from "./detail-layout.module.css";

interface DetailContentProps {
    item: ErrorItemDetail;
    educationStage?: string;
    saveFields: (fields: Partial<ErrorItemDetail>) => Promise<void>;
    onUpdate: UpdateErrorItem;
    reload: () => Promise<void>;
    onDeleted: () => void;
    svgEnabled: boolean;
    geogebraEnabled: boolean;
}

export function DetailContent(props: DetailContentProps) {
    const { item, educationStage, saveFields, onUpdate, reload, onDeleted } = props;
    const { t } = useLanguage();
    const [editing, setEditing] = useState(false);
    const tags = getItemTags(item);
    const source = sourceCaption(item.source);
    const caption = source ? t.detail.sourceLabel.replace("{source}", source) : undefined;
    const closeEdit = () => {
        setEditing(false);
        void reload();
    };
    return <main data-detail-layout className={`${styles.page} min-h-screen`}>
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6" style={{ paddingBottom: "calc(var(--detail-action-height, 5rem) + 1.5rem)" }}>
            <h1 className="sr-only">{t.detail.title}</h1>
            {!editing && <header className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Button asChild variant="ghost" size="icon" className="size-11"><Link href={item.subjectId ? `/notebooks/${item.subjectId}` : "/notebooks"} aria-label={t.common.back}><ArrowLeft className="size-5" aria-hidden="true" /></Link></Button>
                    <p className="min-w-0 break-words text-sm"><Link className="underline-offset-4 hover:underline" href={item.subjectId ? `/notebooks/${item.subjectId}` : "/notebooks"}>{item.subject?.name || t.nav.notebooks}</Link>{tags[0] && <><span aria-hidden="true"> › </span>{tags[0]}</>}</p>
                </div>
                <DetailMenu item={item} onEdit={() => setEditing(true)} onUpdate={onUpdate} reload={reload} onDeleted={onDeleted} svgEnabled={props.svgEnabled} geogebraEnabled={props.geogebraEnabled} />
            </header>}
            {editing ? <EditMode item={item} educationStage={educationStage} saveFields={saveFields} onUpdate={onUpdate} onClose={closeEdit} /> : <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="min-w-0 space-y-4">
                    <PaperCard className="[&>div:last-child]:space-y-6">
                        <QuestionCard item={item} />
                        <AnswerCard item={item} />
                        <AnalysisTabs item={item} />
                    </PaperCard>
                    <GeneratedContent item={item} svgEnabled={props.svgEnabled} geogebraEnabled={props.geogebraEnabled} onUpdate={onUpdate} />
                </div>
                <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
                    {(item.originalImageUrl || caption) && <PaperCard tape>
                        <h2 className="mb-4 text-lg font-semibold">{t.detail.sourcePhoto}</h2>
                        {item.originalImageUrl ? <SourceThumb errorItemId={item.id} previewPage src={item.originalImageUrl} alt={t.detail.originalProblem} caption={caption} /> : <p className="text-[13px] text-muted-foreground">{caption}</p>}
                    </PaperCard>}
                    <ReviewSummary id={item.id} revision={`${item.subjectId}:${item.questionType}`} />
                    <DetailActionBar desktopInline>
                        <Button asChild className="min-h-12 w-full"><Link href={`/practice?id=${item.id}`}>{t.student.trySimilar}</Link></Button>
                    </DetailActionBar>
                </aside>
            </div>}
        </div>
    </main>;
}
