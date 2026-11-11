"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface AgentKeyCardProps {
    loaded: boolean;
    count: number;
    secret: string;
    busy: boolean;
    create: () => Promise<void>;
    hide: () => void;
}

export function AgentKeyCard({ loaded, count, secret, busy, create, hide }: AgentKeyCardProps) {
    const { t } = useLanguage();
    const [message, setMessage] = useState("");
    async function copy() {
        try { await navigator.clipboard.writeText(secret); setMessage(t.agentIntegration.copied); }
        catch { setMessage(t.agentIntegration.copyFailed); }
    }
    return <section className="min-w-0 space-y-3 rounded-lg border p-4">
        <h4 className="font-semibold">{t.agentGuide.keyStep}</h4>
        {count > 0 && <p className="text-sm">{t.agentGuide.tokenCount.replace("{count}", String(count))}</p>}
        <Button className="min-h-11" variant={count > 0 ? "outline" : "default"} disabled={!loaded || busy} onClick={() => { setMessage(""); void create(); }}>
            {busy ? t.agentIntegration.working : t.agentIntegration.create}
        </Button>
        {secret && <div className="min-w-0 space-y-2 rounded-md border p-3">
            <p className="text-sm">{t.agentIntegration.once}</p>
            <code className="block select-all break-all text-sm">{secret}</code>
            <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="min-h-11" onClick={() => void copy()}>{t.agentIntegration.copy}</Button>
                <Button variant="outline" className="min-h-11" onClick={hide}>{t.agentIntegration.hide}</Button>
            </div>
        </div>}
        <p className="text-sm text-muted-foreground">{t.agentGuide.keyHint}</p>
        {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
    </section>;
}
