"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/error-message";
import { frontendLogger } from "@/lib/frontend-logger";
import type { Notebook, PaginatedResponse } from "@/types/api";

type StatState = { status: "loading" } | { status: "error" } | { status: "success"; value: number };
export type HomeStat = StatState & { retry: () => void };
type ResourceState<T> = { status: "loading" } | { status: "error" } | { status: "success"; value: number; data: T };

function useHomeStat<T>(url: string, count: (data: T) => number) {
    const [state, setState] = useState<ResourceState<T>>({ status: "loading" });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        apiClient.get<T>(url, { signal: controller.signal })
            .then(data => {
                if (!controller.signal.aborted) setState({ status: "success", value: count(data), data });
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted) return;
                setState({ status: "error" });
                frontendLogger.error('[Home]', '首页统计加载失败', { url, error: getErrorMessage(error) });
            });
        return () => controller.abort();
    }, [url, count, attempt]);

    const retry = () => {
        setState({ status: "loading" });
        setAttempt(value => value + 1);
    };
    return { ...state, retry };
}

const notebookCount = (data: Notebook[]) => data.length;
const totalCount = (data: PaginatedResponse<unknown>) => data.total;

/** 三项统计独立请求和重试，保留错题本数据供录入目标使用。 */
export function useHomeStats() {
    const notebooks = useHomeStat("/api/notebooks", notebookCount);
    const items = useHomeStat("/api/error-items/list?pageSize=1", totalCount);
    const due = useHomeStat("/api/review/due?pageSize=1", totalCount);
    return { notebooks, items, due };
}
