"use client";

import { X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePaperGroups } from "@/lib/hooks/use-paper-groups";
import { NO_QUESTION_TYPE } from "@/lib/question/question-type";
import type { ErrorListState } from "@/components/error-list/use-error-list";
import type { QuestionType } from "@/lib/question/question-type";

interface ActiveFiltersProps { state: ErrorListState }

export function ActiveFilters({ state }: ActiveFiltersProps) {
    const { t } = useLanguage();
    const { groups } = usePaperGroups();
    const chips: { key: string; label: string; remove: () => void }[] = [];
    if (state.masteryFilter !== "all") chips.push({ key: "mastery", label: t.filter[state.masteryFilter === "new" ? "review" : state.masteryFilter], remove: () => state.setMasteryFilter("all") });
    if (state.timeFilter !== "all") chips.push({ key: "time", label: state.timeFilter === "week" ? t.filter.lastWeek : t.filter.lastMonth, remove: () => state.setTimeFilter("all") });
    if (state.gradeFilter) chips.push({ key: "grade", label: state.gradeFilter, remove: () => state.handleFilterChange({}) });
    if (state.chapterFilter) chips.push({ key: "chapter", label: state.chapterFilter, remove: () => state.handleFilterChange({ gradeSemester: state.gradeFilter }) });
    if (state.selectedTag) chips.push({ key: "tag", label: state.selectedTag, remove: () => state.setSelectedTag(null) });
    if (state.paperLevelFilter !== "all") chips.push({ key: "paper", label: groups.find(group => group.id === state.paperLevelFilter)?.name ?? state.paperLevelFilter, remove: () => state.setPaperLevelFilter("all") });
    for (const type of state.questionTypesFilter) chips.push({ key: type, label: type === NO_QUESTION_TYPE ? t.questionType.notSet : t.questionType.names[type as QuestionType], remove: () => state.setQuestionTypesFilter(state.questionTypesFilter.filter(value => value !== type)) });
    if (!chips.length) return null;
    return <div className="flex flex-wrap gap-1.5" aria-label={t.notebook.activeFilters}>
        {chips.map(chip => <button key={chip.key} type="button" className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full bg-muted px-3 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t.notebook.removeFilter.replace("{filter}", chip.label)} onClick={chip.remove}>
            <span className="truncate">{chip.label}</span><X className="size-3 shrink-0" aria-hidden="true" />
        </button>)}
    </div>;
}
