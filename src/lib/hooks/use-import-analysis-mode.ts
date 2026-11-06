"use client";

import { useState } from "react";

export type ImportAnalysisMode = "ai" | "tags" | "none";

/** 根据内容推荐默认值；用户的明确选择只在换批次时失效。 */
export function useImportAnalysisMode(batchId: string, hasAnswers: boolean | null) {
    const [choice, setChoice] = useState<{ batchId: string; mode: ImportAnalysisMode } | null>(null);
    const mode = choice?.batchId === batchId ? choice.mode : hasAnswers ? "none" : "ai";
    // 等首份草稿加载后只初始化一次，后续删改答案也不改变当前处理方式。
    if (hasAnswers !== null && choice?.batchId !== batchId) setChoice({ batchId, mode });
    return [mode, (next: ImportAnalysisMode) => setChoice({ batchId, mode: next })] as const;
}
