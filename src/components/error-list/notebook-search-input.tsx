"use client";

import { useSyncExternalStore } from "react";
import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";

const compactQuery = "(max-width: 639px)";
function subscribe(onChange: () => void) {
    const media = window.matchMedia?.(compactQuery);
    media?.addEventListener("change", onChange);
    return () => media?.removeEventListener("change", onChange);
}
const isCompact = () => window.matchMedia?.(compactQuery).matches ?? false;
const serverSnapshot = () => false;

type NotebookSearchInputProps = Omit<ComponentProps<typeof Input>, "placeholder" | "aria-label">;

/** 两处题目搜索共用响应式提示，切换宽度时保留输入和焦点。 */
export function NotebookSearchInput(props: NotebookSearchInputProps) {
    const { t } = useLanguage();
    const compact = useSyncExternalStore(subscribe, isCompact, serverSnapshot);
    return <Input {...props} placeholder={compact ? t.student.notebookSearchCompact : t.student.notebookSearch} aria-label={t.student.notebookSearch} />;
}
