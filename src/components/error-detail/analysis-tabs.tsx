"use client";

import { useId, useState } from "react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ErrorItemDetail } from "./types";

interface AnalysisTabsProps { item: ErrorItemDetail }
type Section = "analysis" | "mistakeAnalysis" | "userNotes";

export function AnalysisTabs({ item }: AnalysisTabsProps) {
    const { t } = useLanguage();
    const [section, setSection] = useState<Section>("analysis");
    const id = useId();
    const options = [
        { value: "analysis" as const, label: t.detail.analysis },
        { value: "mistakeAnalysis" as const, label: t.detail.mistakeTab },
        { value: "userNotes" as const, label: t.detail.notesTab },
    ].map(option => ({ ...option, id: `${id}-${option.value}`, panelId: `${id}-panel` }));
    const content = item[section];
    return <section className="min-w-0 rounded-xl border bg-card p-4 shadow-xs sm:p-6">
        <SegmentedControl options={options} value={section} onChange={setSection} aria-label={t.detail.analysis} />
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${section}`} tabIndex={0} className="mt-4 break-words text-base leading-relaxed">
            {!content?.trim() ? <p className="text-muted-foreground">{t.detail.emptySection}</p> : section === "userNotes" ? <p className="whitespace-pre-wrap">{content}</p> : <MarkdownRenderer content={content} />}
        </div>
    </section>;
}
