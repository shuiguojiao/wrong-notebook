"use client";

import { useId } from "react";
import { MistakeCauseSelect } from "@/components/question/mistake-cause-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/lib/feedback";
import { MISTAKE_LESSON_MAX_LENGTH } from "@/lib/question/mistake-cause";
import { useEditableField } from "./use-editable-field";
import type { ErrorItemDetail } from "./types";

interface MistakeCauseFieldsProps {
    item: ErrorItemDetail;
    saveFields: (fields: Partial<ErrorItemDetail>) => Promise<void>;
}

export function MistakeCauseFields({ item, saveFields }: MistakeCauseFieldsProps) {
    const { t } = useLanguage();
    const id = useId();
    const lesson = useEditableField({
        read: () => item.mistakeLesson ?? "",
        save: value => saveFields({ mistakeLesson: value.trim() || null }),
        logLabel: "mistakeLesson",
    });
    return <div className="mb-4 space-y-3">
        <MistakeCauseSelect value={item.mistakeCause} sticker onChange={value => {
            void saveFields({ mistakeCause: value }).catch(() => toast.error(t.common.messages.saveFailed));
        }} />
        {lesson.editing ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); void lesson.submit(); }}>
            <label htmlFor={id} className="block text-sm font-medium">{t.mistakeCause.lesson}</label>
            <Input id={id} autoFocus value={lesson.value} onChange={event => lesson.setValue(event.target.value)}
                maxLength={MISTAKE_LESSON_MAX_LENGTH} placeholder={t.mistakeCause.lessonPlaceholder} className="h-11" />
            <div className="flex flex-wrap gap-2">
                <Button className="min-h-11" type="submit">{t.common.save}</Button>
                <Button className="min-h-11" variant="outline" type="button" onClick={lesson.cancel}>{t.common.cancel}</Button>
            </div>
        </form> : <div className="flex flex-wrap items-center gap-x-3 text-sm">
            <span className="font-medium">{t.mistakeCause.lesson}</span>
            {item.mistakeLesson && <span className="min-w-0 break-words">{item.mistakeLesson}</span>}
            <Button variant="ghost" className="min-h-11" onClick={lesson.start}>{t.common.edit}</Button>
        </div>}
    </div>;
}
