"use client";

import { useMemo } from "react";
import type { KeyboardEvent } from "react";
import { Loader2, PenLine, RotateCcw, Save } from "lucide-react";
import { DirectEntryField } from "@/components/question-entry/direct-entry-field";
import { NotebookSelector } from "@/components/notebook-selector";
import { PaperGroupSelect } from "@/components/paper-group-select";
import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEntryDraft } from "@/lib/hooks/use-entry-draft";
import { directEntryDraftSchema, EMPTY_DIRECT_ENTRY } from "@/lib/import/direct-entry-draft";
import type { DirectEntryDraft } from "@/lib/import/direct-entry-draft";
import { inferSubjectFromName } from "@/lib/tags/knowledge-tags";
import type { MistakeStatus } from "@/lib/question/mistake-status";

interface DirectTextEditorProps {
    onSubmit: (data: Omit<DirectEntryDraft, "gradeSemester" | "paperLevel"> & { gradeSemester?: string; paperLevel?: string }) => Promise<void | boolean>;
    defaultNotebookId?: string;
    defaultNotebookName?: string;
    isSaving: boolean;
    draftKey?: string;
}

/** 题干与答案优先，可选资料收起；保存失败保留草稿，明确成功后才清空。 */
export function DirectTextEditor({ onSubmit, defaultNotebookId, defaultNotebookName, isSaving, draftKey }: DirectTextEditorProps) {
    const { t } = useLanguage();
    const initial = useMemo(() => ({ ...EMPTY_DIRECT_ENTRY, subjectId: defaultNotebookId || "" }), [defaultNotebookId]);
    const [draft, setDraft] = useEntryDraft(draftKey, initial, directEntryDraftSchema);
    const change = <K extends keyof DirectEntryDraft>(key: K, value: DirectEntryDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
    const canSave = !!draft.questionText.trim() && !!draft.subjectId && !isSaving;
    const submit = async () => {
        if (!canSave) return;
        const saved = await onSubmit({
            ...draft, questionText: draft.questionText.trim(), answerText: draft.answerText.trim(),
            analysis: draft.analysis.trim(), wrongAnswerText: draft.wrongAnswerText.trim(), mistakeAnalysis: draft.mistakeAnalysis.trim(),
            gradeSemester: draft.gradeSemester || undefined, paperLevel: draft.paperLevel || undefined,
        });
        if (saved === true) setDraft({ ...initial, subjectId: draft.subjectId });
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void submit(); }
    };
    const fields = [
        { key: "questionText", label: t.editor.question, placeholder: t.directEntry.questionPlaceholder },
        { key: "answerText", label: t.editor.answer, placeholder: t.directEntry.answerPlaceholder },
        { key: "analysis", label: t.editor.analysis, placeholder: t.directEntry.analysisPlaceholder },
        { key: "wrongAnswerText", label: t.editor.wrongAnswerText, placeholder: t.directEntry.wrongAnswerPlaceholder },
        { key: "mistakeAnalysis", label: t.editor.mistakeAnalysis, placeholder: t.directEntry.mistakeAnalysisPlaceholder },
    ] as const;
    const renderField = (field: typeof fields[number]) => <DirectEntryField key={field.key} id={`direct-${field.key}`} label={field.label} placeholder={field.placeholder} value={draft[field.key]} required={field.key === "questionText"} disabled={isSaving} onChange={(value) => change(field.key, value)} onKeyDown={handleKeyDown} />;

    return (
        <Card className="rounded-2xl">
            <CardContent className="space-y-5 p-4 sm:p-6">
                <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground"><PenLine className="h-5 w-5" />{t.directEntry.title}</span>
                    <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setDraft({ ...initial, subjectId: draft.subjectId })} disabled={isSaving}><RotateCcw className="mr-1 h-4 w-4" />{t.entry.clearDraft}</Button>
                </div>
                <div className="space-y-2">
                    <Label>{t.editor.selectNotebook} *</Label>
                    <NotebookSelector allowCreate value={draft.subjectId} onChange={(value) => change("subjectId", value)} />
                </div>
                {fields.slice(0, 2).map(renderField)}
                <details className="rounded-lg border p-3">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{t.entry.optionalFields}</summary>
                    <div className="space-y-4 pt-3">
                        {fields.slice(2).map(renderField)}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="direct-grade">{t.editor.gradeSemester}</Label>
                                <input id="direct-grade" type="text" value={draft.gradeSemester} onChange={(event) => change("gradeSemester", event.target.value)} placeholder={t.directEntry.gradeSemesterPlaceholder} className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base" />
                            </div>
                            <div className="space-y-2"><Label>{t.editor.paperLevel}</Label><PaperGroupSelect value={draft.paperLevel} onChange={(value) => change("paperLevel", value)} /></div>
                        </div>
                        <div className="space-y-2">
                            <Label>{t.editor.mistakeStatus}</Label>
                            <Select value={draft.mistakeStatus} onValueChange={(value) => change("mistakeStatus", value as MistakeStatus)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="not_attempted">{t.editor.mistakeStatuses.notAttempted}</SelectItem>
                                    <SelectItem value="wrong_attempt">{t.editor.mistakeStatuses.wrongAttempt}</SelectItem>
                                    <SelectItem value="unknown">{t.editor.mistakeStatuses.unknown}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>{t.editor.tags}</Label>
                            <TagInput value={draft.knowledgePoints} onChange={(value) => change("knowledgePoints", value)} placeholder={t.editor.tagsPlaceholder} enterHint={t.editor.createTagHint} subject={inferSubjectFromName(defaultNotebookName || null) || undefined} />
                        </div>
                    </div>
                </details>
                <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 space-y-2 rounded-lg border bg-background/95 p-3 shadow-sm md:bottom-4">
                    <Button type="button" onClick={() => void submit()} disabled={!canSave} className="min-h-12 w-full" size="lg">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isSaving ? t.directEntry.saving : t.directEntry.save}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">{t.directEntry.hint}</p>
                </div>
            </CardContent>
        </Card>
    );
}
