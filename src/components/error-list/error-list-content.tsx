"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Search } from "lucide-react";
import { ActiveFilters } from "@/components/error-list/active-filters";
import { ErrorRow } from "@/components/error-list/error-row";
import { FilterSheet } from "@/components/error-list/filter-sheet";
import { useErrorList } from "@/components/error-list/use-error-list";
import type { ErrorListStateProps } from "@/components/error-list/use-error-list";
import { PaperCard } from "@/components/student/paper-card";
import { ErrorListSelectionBar } from "@/components/error-list-selection-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import { formatDateTime } from "@/lib/date-time";
import { buildErrorListParams } from "@/lib/error-list/error-list-filters";
import { groupQuestions, questionPreviewKeys } from "@/lib/question/question-preview-key";
import { locateByShortId } from "@/lib/short-id/short-id-client";
import { isShortId } from "@/lib/short-id/short-id-format";

export interface ErrorListHeaderControls {
    exportPrint: () => void;
    toggleSelect: () => void;
    selecting: boolean;
    total: number | null;
    pending: number | null;
    dueToday: number | null;
}

interface ErrorListContentProps extends ErrorListStateProps {
    hideSearch?: boolean;
    renderHeader?: (controls: ErrorListHeaderControls) => ReactNode;
}

export function ErrorListContent({ renderHeader, hideSearch = false, ...props }: ErrorListContentProps) {
    const { t, language } = useLanguage();
    const { timeZone } = useTimeZone();
    const router = useRouter();
    const state = useErrorList(props);
    const { items, loading, isSelectMode } = state;
    const groups = useMemo(() => groupQuestions(items, timeZone).map(group => ({ ...group, previews: questionPreviewKeys(group.items.map(item => item.questionText)) })), [items, timeZone]);
    const count = (value: number | null) => value === null ? "…" : String(value);
    const mastered = state.counts.total === null || state.counts.pending === null ? null : state.counts.total - state.counts.pending;
    const options = [{ value: "all", label: `${t.filter.all} ${count(state.counts.total)}` }, { value: "unmastered", label: `${t.student.unmastered} ${count(state.counts.pending)}` }, { value: "mastered", label: `${t.student.mastered} ${count(mastered)}` }] as const;

    return (
        <div className={`space-y-3 ${isSelectMode ? "pb-52 sm:pb-28" : "pb-20"}`}>
            {renderHeader?.({ exportPrint: () => router.push(`/print-preview?${buildErrorListParams(state.filters)}`), toggleSelect: state.toggleSelectMode, selecting: isSelectMode, dueToday: state.dueTodayCount, ...state.counts })}
            {!hideSearch && <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                        aria-label={t.student.notebookSearch}
                        placeholder={t.student.notebookSearch}
                        title={t.shortId.searchHint}
                        className="h-11 rounded-xl bg-card pl-9"
                        value={state.search}
                        onChange={event => state.setSearch(event.target.value)}
                        onKeyDown={async event => {
                            const value = state.search.trim();
                            if (event.key !== "Enter" || !isShortId(value)) return;
                            const id = await locateByShortId(value);
                            if (id) router.push(`/error-items/${id}`);
                        }}
                    />
                </div>
                <FilterSheet state={state} subjectName={props.subjectName} tagSet={props.tagSet} />
            </div>}
            <ActiveFilters state={state} />
            <SegmentedControl variant="student" className="!rounded-full [&_button]:!rounded-full" options={options} value={state.masteryFilter} onChange={state.setMasteryFilter} aria-label={t.filter.masteryStatus} />
            {!loading && !items.length && <EmptyState icon={Inbox} title={t.notebook.emptyList} description={t.notebook.emptyListHint} />}
            {loading && !items.length && <div className="divide-y rounded-xl border bg-card" aria-label={t.common.loading}>{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[76px] animate-pulse bg-muted/50" />)}</div>}
            <div className={`space-y-3 transition-opacity motion-reduce:transition-none ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
                {groups.map(group => <section key={group.key} aria-label={`${group.date} · ${group.source || t.notebook.manualSource}`}>
                    <h2 className="mb-2 flex min-w-0 gap-1 text-[13px] leading-5 text-muted-foreground">
                        <span className="shrink-0">{formatDateTime(group.items[0].createdAt, language === "zh" ? "M月d日" : "MMM d", timeZone)} ·</span>
                        <span className="truncate">{group.source || t.notebook.manualSource}</span>
                        <span className="shrink-0">· {t.notebook.groupCount.replace("{count}", String(group.items.length))}</span>
                    </h2>
                    <PaperCard className="overflow-hidden p-0 sm:p-0 [&>div.relative]:divide-y">
                        {group.items.map((item, index) => <ErrorRow key={item.id} item={item} preview={group.previews[index]} selectMode={isSelectMode} selected={state.selectedIds.has(item.id)} onToggleSelect={() => state.toggleSelectItem(item.id)} onLongPress={() => state.longPressItem(item.id)} />)}
                    </PaperCard>
                </section>)}
            </div>
            <Pagination page={state.page} totalPages={state.totalPages} total={state.total} pageSize={state.pageSize} onPageChange={state.setPage} />
            {isSelectMode && <ErrorListSelectionBar selectedIds={[...state.selectedIds]} deleting={state.isDeleting} onCancel={state.toggleSelectMode} onDelete={state.handleBatchDelete} />}
        </div>
    );
}
