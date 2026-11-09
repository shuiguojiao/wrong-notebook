"use client";

import { useEffect, useState } from "react";
import { SourceThumb } from "@/components/question/source-thumb";
import { SourceViewer } from "@/components/question/source-viewer";
import { ReplaceQuestionImageButton } from "@/components/replace-question-image-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { FocusCard } from "@/components/ui/focus-card";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { textSuggestion } from "@/lib/question/pending-checks";
import type { PendingQuestion } from "@/lib/question/pending-checks";
import type { SourceRegion, SourceView } from "@/lib/question/source-view";

interface CheckQuestionCardProps {
    item: PendingQuestion;
    position: number;
    total: number;
    busy: boolean;
    onClose: () => void;
    onResolve: (action: "accept" | "dismiss" | "delete") => Promise<void>;
    onReframe: (pageId: string, regions: SourceRegion[]) => Promise<void>;
    onReplaced: () => void;
}

export function CheckQuestionCard({ item, position, total, busy, onClose, onResolve, onReframe, onReplaced }: CheckQuestionCardProps) {
    const { t } = useLanguage();
    const [source, setSource] = useState<SourceView>();
    const [viewing, setViewing] = useState(false);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        if (!item.hasSource) return;
        const controller = new AbortController();
        apiClient.get<SourceView>(`/api/error-items/${encodeURIComponent(item.id)}/source`, { signal: controller.signal })
            .then(data => { if (!controller.signal.aborted) { setSource(data); setFailed(false); } })
            .catch(() => { if (!controller.signal.aborted) setFailed(true); });
        return () => controller.abort();
    }, [item.id, item.hasSource, retry]);
    const issue = item.issues[0];
    const suggestion = textSuggestion(issue);
    const reframe = async (pageId: string, regions: SourceRegion[]) => {
        await onReframe(pageId, regions);
        setViewing(false);
    };
    const primary = issue.code === "text_diff" ? <Button className="min-h-12 w-full" disabled={busy || !suggestion} onClick={() => void onResolve("accept")}>
        {t.checks.accept.replace("{text}", suggestion?.imageSays ?? "")}
    </Button> : issue.code === "image_mismatch" && item.hasSource ? <Button className="min-h-12 w-full" disabled={busy || !source?.page} onClick={() => setViewing(true)}>{t.checks.reframe}</Button>
        : <div className="[&_button]:min-h-12 [&_button]:w-full [&_button]:bg-primary [&_button]:text-primary-foreground">
            <ReplaceQuestionImageButton errorItemId={item.id} hasImage={!!item.originalImageUrl} onDone={onReplaced} onConflict={onReplaced}
                expectedUpdatedAt={item.updatedAt} label={issue.code === "missing_figure" ? t.checks.addImage : t.checks.replace} />
        </div>;
    return <>
        <FocusCard className="[&_.review-action-bar]:mx-auto [&_.review-action-bar]:max-w-2xl" title={`${t.checks.title} · ${position} / ${total}`} progress={(position - 1) / total * 100} onClose={onClose} closeDisabled={busy}
            footer={<div className="w-full space-y-2">{primary}<div className="grid grid-cols-2 gap-3">
                <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => void onResolve("dismiss")}>{t.checks.dismiss}</Button>
                <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => void onResolve("delete")}>{t.checks.delete}</Button>
            </div></div>}>
            <div className="space-y-5">
                {(item.originalImageUrl || source?.page) && <SourceThumb src={item.originalImageUrl || source!.page!.imageUrl} alt={t.checks.original}
                    source={source} onReframe={item.hasSource ? reframe : undefined} busy={busy} className="[&_img[data-question-crop]]:max-h-80" />}
                {failed && <p role="alert">{t.sourceViewer.loadError}<Button variant="link" onClick={() => setRetry(value => value + 1)}>{t.review.retry}</Button></p>}
                {suggestion ? <dl className="divide-y border-y text-[17px] leading-relaxed">
                    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 py-4"><dt className="text-sm text-muted-foreground">{t.checks.original}</dt><dd className="break-words">{suggestion.imageSays}</dd></div>
                    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 py-4"><dt className="text-sm text-muted-foreground">{t.checks.stored}</dt><dd className="break-words"><mark className="rounded bg-amber-100 px-1 text-amber-950">{suggestion.textSays}</mark></dd></div>
                </dl> : <p className="rounded-lg bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                    {issue.code === "image_mismatch" ? t.checks.mismatch : t.questionCheck.missingFigure}
                </p>}
                <p className="whitespace-pre-wrap break-words text-[17px] leading-[1.75]">{item.preview}</p>
            </div>
        </FocusCard>
        {source?.page && <Dialog open={viewing} onOpenChange={open => { if (!busy) setViewing(open); }}><DialogPortal><DialogOverlay />
            <SourceViewer source={{ ...source, page: source.page }} alt={t.checks.original} onReframe={reframe} busy={busy} startEditing />
        </DialogPortal></Dialog>}
    </>;
}
