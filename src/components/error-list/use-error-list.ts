"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { buildErrorListParams } from "@/lib/error-list/error-list-filters";
import { NO_QUESTION_TYPE } from "@/lib/question/question-type";
import { confirmDialog, toast } from "@/lib/feedback";
import { frontendLogger } from "@/lib/frontend-logger";
import type { ErrorListFilters, PaperLevelFilter as PaperLevel, TimeFilter } from "@/lib/error-list/error-list-filters";
import type { MasteryStatus } from "@/lib/mastery-status";
import type { ErrorItemSummary, PaginatedResponse } from "@/types/api";

export interface ErrorListStateProps {
    subjectId?: string;
    subjectName?: string;
    tagSet?: string;
    initialMastery?: MasteryStatus;
    initialTag?: string;
}

type KnowledgeFilterChange = { gradeSemester?: string; chapter?: string; tag?: string | null };

export function useErrorList({ subjectId, initialMastery, initialTag }: ErrorListStateProps) {
    const { t } = useLanguage();
    const [items, setItems] = useState<ErrorItemSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [masteryFilter, setMasteryFilter] = useState<"all" | MasteryStatus>(initialMastery ?? "all");
    const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
    const [gradeFilter, setGradeFilter] = useState("");
    const [chapterFilter, setChapterFilter] = useState("");
    const [paperLevelFilter, setPaperLevelFilter] = useState<PaperLevel>("all");
    const [questionTypesFilter, setQuestionTypesFilter] = useState<string[]>([]);
    const [selectedTag, setSelectedTag] = useState<string | null>(initialTag ?? null);
    // 分页状态
    const [page, setPage] = useState(1);
    const pageSize = DEFAULT_PAGE_SIZE;
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    // 多选模式状态
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);

    const [counts, setCounts] = useState<{ total: number | null; pending: number | null }>({ total: null, pending: null });
    const fetchCounts = useCallback(async () => {
        if (!subjectId) return;
        const base = new URLSearchParams({ subjectId, pageSize: "1" });
        try {
            const [all, pending] = await Promise.all([
                apiClient.get<PaginatedResponse<ErrorItemSummary>>(`/api/error-items/list?${base}`),
                apiClient.get<PaginatedResponse<ErrorItemSummary>>(`/api/error-items/list?${base}&mastery=new`),
            ]);
            setCounts({ total: all.total, pending: pending.total });
        } catch (error) {
            frontendLogger.error('[ErrorList]', 'Failed to fetch notebook counts', { error });
        }
    }, [subjectId]);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 数据请求：进入错题本时异步加载全本计数
        void fetchCounts();
    }, [fetchCounts]);

    const filters: ErrorListFilters = useMemo(() => ({
        subjectId, search, mastery: masteryFilter, timeRange: timeFilter, tag: selectedTag,
        gradeSemester: gradeFilter, chapter: chapterFilter, paperLevel: paperLevelFilter,
        questionTypes: questionTypesFilter.map((value) => value === NO_QUESTION_TYPE ? "none" : value) as ErrorListFilters["questionTypes"],
    }), [subjectId, search, masteryFilter, timeFilter, selectedTag, gradeFilter, chapterFilter, paperLevelFilter, questionTypesFilter]);

    const handleFilterChange = ({ gradeSemester, chapter, tag }: KnowledgeFilterChange) => {
        if (gradeSemester !== undefined) setGradeFilter(gradeSemester);
        if (chapter !== undefined) setChapterFilter(chapter);
        // KnowledgeFilter 清除标签时传入 { tag: undefined }，统一转成 null
        setSelectedTag(tag === undefined ? null : tag);

        // 清除年级时一并清除章节和标签，清除章节时只清章节
        if (!gradeSemester) {
            setGradeFilter("");
            setChapterFilter("");
            setSelectedTag(null);
        } else if (!chapter) {
            setChapterFilter("");
        }
        setPage(1); // 筛选变化时重置页码
    };

    // 多选模式相关函数
    const toggleSelectMode = () => {
        setIsSelectMode(!isSelectMode);
        setSelectedIds(new Set());
    };

    const toggleSelectItem = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const requestId = useRef(0);
    const fetchItems = useCallback(async () => {
        const currentRequest = ++requestId.current;
        setLoading(true);
        try {
            const params = buildErrorListParams(filters);
            params.append("page", page.toString());
            params.append("pageSize", pageSize.toString());
            const response = await apiClient.get<PaginatedResponse<ErrorItemSummary>>(`/api/error-items/list?${params.toString()}`);
            if (currentRequest !== requestId.current) return;
            if (page > Math.max(1, response.totalPages)) { setPage(Math.max(1, response.totalPages)); return; }
            setItems(response.items);
            setTotal(response.total);
            setTotalPages(response.totalPages);
        } catch (error) {
            frontendLogger.error('[ErrorList]', 'Failed to fetch error items', { error });
        } finally {
            if (currentRequest === requestId.current) setLoading(false);
        }
    }, [filters, page, pageSize]);

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;

        const confirmMsg = (t.notebook?.confirmBatchDelete || "Delete {count} items?").replace("{count}", selectedIds.size.toString());
        if (!(await confirmDialog(confirmMsg, { destructive: true }))) return;

        setIsDeleting(true);
        try {
            await apiClient.post("/api/error-items/batch-delete", { ids: Array.from(selectedIds) });
            toast.success(t.notebook?.batchDeleteSuccess || "Deleted successfully");
            setIsSelectMode(false);
            setSelectedIds(new Set());
            void fetchItems();
            void fetchCounts();
        } catch (error) {
            frontendLogger.error('[ErrorList]', 'Batch delete failed', { error });
            toast.error(t.common?.messages?.deleteFailed || "Delete failed");
        } finally {
            setIsDeleting(false);
        }
    };

    // 追踪筛选条件是否变化（用于判断是否需要重置页码）
    const prevFiltersRef = useRef(filters);

    useEffect(() => {
        const filtersChanged = prevFiltersRef.current !== filters;
        prevFiltersRef.current = filters;

        if (filtersChanged && page !== 1) {
            // 筛选条件变化且不在第一页，重置到第一页（会再次触发此 effect）
            setPage(1);
            return;
        }

        fetchItems();
    }, [page, filters, fetchItems]);

    const resetFilters = () => {
        setMasteryFilter("all"); setTimeFilter("all"); setGradeFilter(""); setChapterFilter("");
        setPaperLevelFilter("all"); setQuestionTypesFilter([]); setSelectedTag(null);
    };
    const longPressItem = (id: string) => { setIsSelectMode(true); setSelectedIds(new Set([id])); };
    return {
        items, loading, search, setSearch, filters, masteryFilter, setMasteryFilter,
        timeFilter, setTimeFilter, gradeFilter, setGradeFilter, chapterFilter, setChapterFilter,
        paperLevelFilter, setPaperLevelFilter, questionTypesFilter, setQuestionTypesFilter,
        selectedTag, setSelectedTag, handleFilterChange, resetFilters, counts,
        page, setPage, pageSize, total, totalPages, isSelectMode, selectedIds, isDeleting,
        toggleSelectMode, toggleSelectItem, longPressItem, handleBatchDelete,
    };
}

export type ErrorListState = ReturnType<typeof useErrorList>;
