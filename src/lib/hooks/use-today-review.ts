"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { notebookDisplayNames } from "@/lib/notebook-display-names";
import type { Notebook, ReviewQueueResponse } from "@/types/api";

type ReviewState = { status: "loading" } | { status: "error" } | { status: "success"; data: ReviewQueueResponse };

/** 今天与旧概览路由共用取数、返回提示及重试逻辑。 */
export function useTodayReview() {
    const [state, setState] = useState<ReviewState>({ status: "loading" });
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [attempt, setAttempt] = useState(0);
    const [backlogHint, setBacklogHint] = useState(false);
    const [completed, setCompleted] = useState(0);
    useEffect(() => {
        let cancelled = false;
        apiClient.get<Notebook[]>("/api/notebooks")
            .then(data => { if (!cancelled) setNotebooks(data); })
            .catch(() => { if (!cancelled) setNotebooks([]); });
        apiClient.get<ReviewQueueResponse>("/api/review/due?format=overview")
            .then(data => {
                if (cancelled) return;
                setState({ status: "success", data });
                try {
                    const key = `review-backlog:${data.dayKey}`;
                    setBacklogHint(data.backlogHint && !sessionStorage.getItem(key));
                    if (data.backlogHint) sessionStorage.setItem(key, "1");
                    const count = Number(sessionStorage.getItem("review-completed"));
                    if (Number.isSafeInteger(count) && count > 0) setCompleted(count);
                    sessionStorage.removeItem("review-completed");
                } catch {
                    // 浏览器禁用会话存储时仍可复习，只省略一次性返回提示。
                }
            })
            .catch(() => { if (!cancelled) setState({ status: "error" }); });
        return () => { cancelled = true; };
    }, [attempt]);
    const names = notebooks.map(notebook => notebook.name);
    const shortened = notebookDisplayNames(names);
    const displayNames = new Map(names.map((name, index) => [name, shortened[index]]));
    const displayName = (name?: string | null) => displayNames.get(name ?? "") ?? name;
    const data = state.status === "success" ? {
        ...state.data,
        items: state.data.items.map(item => ({ ...item, subjectName: displayName(item.subjectName) })),
        reviewedSubjects: state.data.reviewedSubjects?.map(subject => ({ ...subject, subjectName: displayName(subject.subjectName) })),
    } : undefined;
    return { status: state.status, data, notebooks, backlogHint, completed, retry: () => {
        setState({ status: "loading" });
        setAttempt(value => value + 1);
    } };
}
