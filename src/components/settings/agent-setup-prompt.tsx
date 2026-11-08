"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { agentSetupPrompt } from "@/lib/agent/client-config";

interface AgentSetupPromptProps {
    origin: string;
    direct?: boolean;
}

/** 用户把提示词交给自己的 agent，由 agent 完成 MCP 配置与 Skill 安装。 */
export function AgentSetupPrompt({ origin, direct = false }: AgentSetupPromptProps) {
    const { t, language } = useLanguage();
    const text = t.agentIntegration;
    const [message, setMessage] = useState("");
    const prompt = agentSetupPrompt(origin, language);

    async function copy() {
        try { await navigator.clipboard.writeText(prompt); setMessage(text.copied); }
        catch { setMessage(text.copyFailed); }
    }

    if (direct) return <div className="space-y-2">
        <p className="break-words text-sm text-muted-foreground">{text.setupPromptHint}</p>
        <Button className="min-h-11" variant="outline" onClick={() => void copy()}>{text.copySetupPrompt}</Button>
        {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
    </div>;

    return <details className="min-w-0 space-y-2">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">{text.setupPrompt}</summary>
        <p className="break-words text-sm text-muted-foreground">{text.setupPromptHint}</p>
        <pre className="max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{prompt}</pre>
        <Button className="min-h-11" variant="outline" onClick={() => void copy()}>{text.copySetupPrompt}</Button>
        {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
    </details>;
}
