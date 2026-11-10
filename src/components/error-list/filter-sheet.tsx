"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { KnowledgeFilter } from "@/components/knowledge-filter";
import { PaperLevelFilter } from "@/components/error-list/paper-level-filter";
import { QuestionTypeFilter } from "@/components/error-list/question-type-filter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ErrorListState } from "@/components/error-list/use-error-list";

interface FilterSheetProps {
    state: ErrorListState;
    subjectName?: string;
    tagSet?: string;
}

/** 筛选即时生效；手机从底部展开，桌面从右侧展开。 */
export function FilterSheet({ state, subjectName, tagSet }: FilterSheetProps) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const timeOptions = [{ value: "all", label: t.filter.allTime }, { value: "week", label: t.filter.lastWeek }, { value: "month", label: t.filter.lastMonth }] as const;
    const masteryOptions = [{ value: "all", label: t.filter.all }, { value: "unmastered", label: t.student.unmastered }, { value: "mastered", label: t.student.mastered }] as const;
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="h-11 shrink-0"><SlidersHorizontal className="size-4" aria-hidden="true" />{t.notebook.filter}</Button>
            </DialogTrigger>
            <DialogPortal>
                <DialogOverlay />
                <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border bg-card p-4 text-card-foreground shadow-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:p-6">
                    <div className="flex items-center justify-between">
                        <DialogTitle>{t.notebook.filter}</DialogTitle>
                        <DialogClose asChild><Button variant="ghost" size="icon" className="size-11" aria-label={t.common.close}><X className="size-4" /></Button></DialogClose>
                    </div>
                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-4">
                        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">{t.filter.masteryStatus}</legend>
                            <div className="flex flex-wrap gap-2">{masteryOptions.map(option => <Button key={option.value} variant={state.masteryFilter === option.value ? "secondary" : "outline"} aria-pressed={state.masteryFilter === option.value} onClick={() => state.setMasteryFilter(option.value)}>{option.label}</Button>)}</div>
                        </fieldset>
                        <fieldset><legend className="mb-2 text-sm font-medium">{t.filter.timeRange}</legend>
                            <div className="flex flex-wrap gap-2">{timeOptions.map(option => <Button key={option.value} variant={state.timeFilter === option.value ? "secondary" : "outline"} aria-pressed={state.timeFilter === option.value} onClick={() => state.setTimeFilter(option.value)}>{option.label}</Button>)}</div>
                        </fieldset>
                        <fieldset><legend className="mb-2 text-sm font-medium">{t.filter.knowledgePoint}</legend>
                            <KnowledgeFilter gradeSemester={state.gradeFilter} chapter={state.chapterFilter} tag={state.selectedTag} onFilterChange={state.handleFilterChange} subjectName={subjectName} tagSet={tagSet} className="flex-col [&>button]:h-11 [&>button]:w-full" />
                        </fieldset>
                        <fieldset><legend className="mb-2 text-sm font-medium">{t.filter.paperLevel}</legend><PaperLevelFilter value={state.paperLevelFilter} onChange={state.setPaperLevelFilter} /></fieldset>
                        <fieldset><legend className="mb-2 text-sm font-medium">{t.questionType.label}</legend><QuestionTypeFilter value={state.questionTypesFilter} onChange={state.setQuestionTypesFilter} /></fieldset>
                    </div>
                    <div className="flex gap-2 border-t pt-4 pb-[env(safe-area-inset-bottom)]">
                        <Button variant="outline" onClick={state.resetFilters}>{t.notebook.clearFilters}</Button>
                        <DialogClose asChild><Button className="flex-1">{t.notebook.filterDone}</Button></DialogClose>
                    </div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
