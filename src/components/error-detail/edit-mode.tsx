"use client";

import { FigureScaleEditor } from "./figure-scale-editor";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/error-message";
import { confirmDialog, toast } from "@/lib/feedback";
import { frontendLogger } from "@/lib/frontend-logger";
import { updateErrorItemSchema, updateNotesSchema } from "@/lib/schemas/error-items";
import { DetailActionBar } from "./detail-action-bar";
import { EditMetadata } from "./edit-metadata";
import { changedFields, createEditValues } from "./edit-values";
import type { EditValues } from "./edit-values";
import type { ErrorItemDetail, UpdateErrorItem } from "./types";

interface EditModeProps {
    item: ErrorItemDetail;
    educationStage?: string;
    saveFields: (fields: Partial<ErrorItemDetail>) => Promise<void>;
    onUpdate: UpdateErrorItem;
    onClose: () => void;
}

/** 统一编辑，笔记沿用独立接口，成功的部分即时推进基线，重试只发剩余修改。 */
export function EditMode({ item, educationStage, saveFields, onUpdate, onClose }: EditModeProps) {
    const { t } = useLanguage();
    const [saved, setSaved] = useState(() => createEditValues(item));
    const [draft, setDraft] = useState(saved);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const lock = useRef(false);
    const dirty = Object.keys(changedFields(saved, draft)).length > 0;
    const update = (fields: Partial<EditValues>) => setDraft(value => ({ ...value, ...fields }));
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);
    const cancel = async () => {
        if (lock.current) return;
        if (!dirty || await confirmDialog(t.detail.discardChanges)) onClose();
    };
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (lock.current) return;
        const { userNotes, ...fields } = changedFields(saved, draft);
        if (!updateErrorItemSchema.safeParse(fields).success || (userNotes !== undefined && !updateNotesSchema.safeParse({ userNotes }).success)) {
            setError(t.common.messages.saveFailed);
            return;
        }
        lock.current = true;
        setSaving(true); setError("");
        let coreSaved = false;
        try {
            if (Object.keys(fields).length) {
                await saveFields(fields);
                coreSaved = true;
                setSaved(current => ({ ...draft, userNotes: current.userNotes }));
            }
            if (userNotes !== undefined) {
                await apiClient.patch(`/api/error-items/${item.id}/notes`, { userNotes });
                onUpdate({ userNotes });
                setSaved(draft);
            }
            toast.success(t.common.messages.saveSuccess);
            onClose();
        } catch (err) {
            frontendLogger.error('[ErrorDetail]', '保存编辑内容失败', { error: getErrorMessage(err) });
            setError(coreSaved ? t.detail.partialSave : t.common.messages.saveFailed);
        } finally {
            lock.current = false;
            setSaving(false);
        }
    };
    const textFields = [
        { key: "questionText" as const, label: t.detail.question, rows: 6 },
        { key: "answerText" as const, label: t.detail.correctAnswerLabel, rows: 4 },
        { key: "wrongAnswerText" as const, label: t.editor.wrongAnswerText, rows: 4 },
        { key: "analysis" as const, label: t.detail.analysis, rows: 6 },
        { key: "mistakeAnalysis" as const, label: t.detail.mistakeAnalysis, rows: 4 },
    ];
    return <>
    <form onSubmit={submit} aria-label={t.detail.editTitle} className="space-y-5">
        <h2 className="text-xl font-semibold">{t.detail.editTitle}</h2>
        <fieldset disabled={saving} className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
            {textFields.map(({ key, label, rows }) => <div key={key} className="space-y-2">
                <label htmlFor={`edit-${key}`} className="text-sm font-medium">{label}</label>
                <MarkdownEditor id={`edit-${key}`} value={draft[key]} rows={rows} onChange={value => update({
                    [key]: value,
                    ...(key === "wrongAnswerText" && value.trim() ? { mistakeStatus: "wrong_attempt" } : {}),
                })} />
            </div>)}
            <div className="space-y-2">
                <label htmlFor="edit-mistake-status" className="text-sm font-medium">{t.editor.mistakeStatus}</label>
                <select id="edit-mistake-status" className="min-h-11 w-full rounded-md border bg-background px-3" value={draft.mistakeStatus} onChange={event => update({ mistakeStatus: event.target.value })}>
                    <option value="unknown">{t.editor.mistakeStatuses.unknown}</option>
                    <option value="not_attempted">{t.editor.mistakeStatuses.notAttempted}</option>
                    <option value="wrong_attempt">{t.editor.mistakeStatuses.wrongAttempt}</option>
                </select>
            </div>
            <div className="space-y-2">
                <label htmlFor="edit-notes" className="text-sm font-medium">{t.detail.notesTab}</label>
                <Textarea id="edit-notes" value={draft.userNotes} rows={5} onChange={event => update({ userNotes: event.target.value })} />
            </div>
            <EditMetadata value={draft} onChange={update} item={item} educationStage={educationStage} />
        </fieldset>
        <DetailActionBar>
            <div className="mx-auto max-w-6xl space-y-3">
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <div className="flex gap-3">
                    <Button type="button" variant="outline" disabled={saving} onClick={() => void cancel()} className="min-h-11 flex-1">{t.common.cancel}</Button>
                    <Button type="submit" disabled={saving || !dirty} className="min-h-11 flex-1">{saving ? t.common.progress.saving : t.common.save}</Button>
                </div>
            </div>
        </DetailActionBar>
    </form>
    {/* 配图比例自带保存按钮，作为独立表单放在编辑表单之后，避免表单嵌套 */}
    {item.figureSvg && <section className="mt-5 rounded-xl border bg-card p-4 sm:p-6">
        <FigureScaleEditor key={`${item.id}-${item.figureScale}-${item.figureAlign}`}
            svg={item.figureSvg} scale={item.figureScale} align={item.figureAlign}
            onSave={(figureScale, figureAlign) => saveFields({ figureScale, figureAlign })} />
    </section>}
    </>;
}
