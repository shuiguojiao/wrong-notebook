"use client";

import { useState } from "react";
import { Camera, BookOpen, Search, Puzzle, Pencil, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface AgentExamplesProps { notebookName?: string }

export function AgentExamples({ notebookName }: AgentExamplesProps) {
    const { t } = useLanguage();
    const text = t.agentGuide;
    const [message, setMessage] = useState("");
    const examples = [text.exampleImport, text.examplePdf, text.exampleSearch, text.exampleDuplicate, text.exampleUpdate, text.exampleSource];
    const icons = [Camera, BookOpen, Search, Puzzle, Pencil, Image];
    async function copy(value: string) {
        try { await navigator.clipboard.writeText(value); setMessage(t.agentIntegration.copied); }
        catch { setMessage(t.agentIntegration.copyFailed); }
    }
    return <section className="min-w-0 space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-semibold">{text.examplesStep}</h4>
            <p className="text-xs text-muted-foreground">{text.copyExampleHint}</p>
        </div>
        <ul className="space-y-2">
            {examples.map((template, index) => {
                const example = template.replaceAll("{notebook}", notebookName || text.defaultNotebook);
                const Icon = icons[index];
                return <li key={template}>
                    <Button variant="ghost" className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal px-2 py-3 text-left font-normal" onClick={() => void copy(example)}>
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        <span className="min-w-0 break-words">{example}</span>
                    </Button>
                </li>;
            })}
        </ul>
        {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
    </section>;
}
