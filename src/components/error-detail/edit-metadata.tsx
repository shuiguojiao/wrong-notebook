"use client";

import { DifficultyStars } from "@/components/difficulty-stars";
import { GradeSemesterSelect } from "@/components/grade-semester-select";
import { NotebookSelector } from "@/components/notebook-selector";
import { RetagItemButton } from "@/components/retag-item-button";
import { Button } from "@/components/ui/button";
import { TagInput } from "@/components/tag-input";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePaperGroups } from "@/lib/hooks/use-paper-groups";
import { QUESTION_TYPES } from "@/lib/question/question-type";
import { inferSubjectFromName } from "@/lib/tags/knowledge-tags";
import type { EditValues } from "./edit-values";
import type { ErrorItemDetail } from "./types";

interface EditMetadataProps {
    value: EditValues;
    onChange: (fields: Partial<EditValues>) => void;
    item: ErrorItemDetail;
    educationStage?: string;
}

export function EditMetadata({ value, onChange, item, educationStage }: EditMetadataProps) {
    const { t } = useLanguage();
    const { groups, loading, error, refetch } = usePaperGroups();
    return <div className="space-y-5">
        <div className="space-y-2">
            <label htmlFor="detail-question-type" className="text-sm font-medium">{t.questionType.label}</label>
            <select id="detail-question-type" className="min-h-11 w-full rounded-md border bg-background px-3"
                value={value.questionType} onChange={event => onChange({ questionType: event.target.value })}>
                <option value="">{t.questionType.notSet}</option>
                {QUESTION_TYPES.map(type => <option key={type} value={type}>{t.questionType.names[type] || type}</option>)}
            </select>
        </div>
        <div className="space-y-2">
            <label htmlFor="detail-grade-semester" className="text-sm font-medium">{t.editor.gradeSemester}</label>
            <GradeSemesterSelect id="detail-grade-semester" value={value.gradeSemester}
                onChange={gradeSemester => onChange({ gradeSemester })} />
        </div>
        <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.notebooks.title}</legend>
            <NotebookSelector value={value.subjectId || undefined} onChange={subjectId => onChange({ subjectId })} />
        </fieldset>
        <div className="space-y-2">
            <label htmlFor="detail-paper-level" className="text-sm font-medium">{t.filter.paperLevel}</label>
            <select id="detail-paper-level" className="min-h-11 w-full rounded-md border bg-background px-3"
                disabled={loading} value={value.paperLevel} onChange={event => onChange({ paperLevel: event.target.value })}>
                <option value="">{t.common.notSet}</option>
                {value.paperLevel && !groups.some(group => group.id === value.paperLevel) && <option value={value.paperLevel} disabled>{value.paperLevel}</option>}
                {groups.filter(group => group.isActive || group.id === value.paperLevel).map(group => (
                    <option key={group.id} value={group.id} disabled={!group.isActive}>{group.name}</option>
                ))}
            </select>
            {error && <p role="alert" className="text-sm text-destructive">{t.common.messages.loadFailed}<Button type="button" variant="link" onClick={() => void refetch()}>{t.review.retry}</Button></p>}
        </div>
        <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.editor.tags}</legend>
            <TagInput value={JSON.parse(value.knowledgePoints) as string[]}
                onChange={tags => onChange({ knowledgePoints: JSON.stringify(tags) })}
                placeholder={t.editor.tagsPlaceholder}
                subject={inferSubjectFromName(item.subject?.name || null) || undefined} gradeStage={educationStage} />
            <p className="text-xs text-muted-foreground">{t.editor.tagsHint}</p>
            {/* 原工具按钮未声明 type，在表单内取消默认提交，仅把 AI 建议填入草稿。 */}
            <div onClick={event => event.preventDefault()}>
                <RetagItemButton errorItemId={item.id}
                    onSuggested={tags => onChange({ knowledgePoints: JSON.stringify(tags) })} />
            </div>
        </fieldset>
        <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.difficulty.label}</legend>
            <DifficultyStars value={value.difficultyStars} onChange={difficultyStars => onChange({ difficultyStars })}
                size="md" className="[&_button]:size-11" />
        </fieldset>
    </div>;
}
