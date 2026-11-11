"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { agentSetupPrompt } from "@/lib/agent/client-config";

interface SetupPromptCardProps { origin: string }

/** 用户把提示词交给自己的 AI 助手，由助手完成配置与安装。 */
export function SetupPromptCard({ origin }: SetupPromptCardProps) {
    const { t, language } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const [message, setMessage] = useState("");
    const previewId = useId();
    const prompt = agentSetupPrompt(origin, language);
    async function copy() {
        try { await navigator.clipboard.writeText(prompt); setMessage(t.agentIntegration.copied); }
        catch { setMessage(t.agentIntegration.copyFailed); }
    }
    return <section className="min-w-0 space-y-3 rounded-lg border p-4">
        <h4 className="font-semibold">{t.agentGuide.setupStep}</h4>
        <pre id={previewId} className={`max-w-full whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm ${expanded ? "" : "line-clamp-3"}`}>{prompt}</pre>
        <Button variant="ghost" className="min-h-11" aria-expanded={expanded} aria-controls={previewId} onClick={() => setExpanded(!expanded)}>
            {expanded ? t.agentGuide.collapsePrompt : t.agentGuide.expandPrompt}
        </Button>
        <div className="flex flex-wrap items-center gap-3">
            <Button className="min-h-11" disabled={!origin} onClick={() => void copy()}>{t.agentIntegration.copySetupPrompt}</Button>
            <p className="text-xs text-muted-foreground">{t.agentGuide.supportedClients}</p>
        </div>
        {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
    </section>;
}
