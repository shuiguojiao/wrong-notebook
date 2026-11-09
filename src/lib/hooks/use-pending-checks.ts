"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { PendingChecks } from "@/lib/question/pending-checks";

/** 结果页停留时继续接收后台 AI 结果；卸载后取消请求及计时器。 */
export function usePendingChecks(ids?: string[]) {
    const query = ids ? `?ids=${encodeURIComponent([...new Set(ids)].sort().join(","))}` : "";
    const [result, setResult] = useState<{ query: string; data: PendingChecks }>();
    useEffect(() => {
        if (query === "?ids=") return;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        const refresh = async () => {
            try {
                const data = await apiClient.get<PendingChecks>(`/api/checks/pending${query}`, { signal: controller.signal });
                if (!controller.signal.aborted) setResult({ query, data });
            } catch {
                // 提示入口读取失败时保留已取得的结果，下一轮再试。
            } finally {
                if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 5000);
            }
        };
        void refresh();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [query]);
    return result?.query === query ? result.data : undefined;
}
