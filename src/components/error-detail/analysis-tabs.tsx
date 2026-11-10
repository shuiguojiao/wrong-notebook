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
    const cause = item.errorType?.trim();
    const shortCause = cause && cause.length <= 48 && !cause.includes("\n");
    return <section className="min-w-0">
        <SegmentedControl variant="student" options={options} value={section} onChange={setSection} aria-label={t.detail.analysis} />
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${section}`} tabIndex={0} className="mt-4 break-words text-base leading-relaxed">
            {section === "mistakeAnalysis" && cause && <p className="mb-4 whitespace-pre-wrap">{shortCause ? <span className="student-sticker inline-block max-w-full rounded-full border bg-muted px-3 py-2 text-sm font-semibold">{cause}</span> : cause}</p>}
            {!content?.trim() ? !(section === "mistakeAnalysis" && cause) && <p className="text-muted-foreground">{t.detail.emptySection}</p> : section === "userNotes" ? <p className="whitespace-pre-wrap">{content}</p> : <MarkdownRenderer content={content} />}
        </div>
    </section>;
}
