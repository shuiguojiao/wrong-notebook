"use client";

import { useEffect, useId, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAgentTokens } from "@/lib/hooks/use-agent-tokens";
import { AgentAdvanced } from "./advanced";
import { AgentExamples } from "./examples";
import { AgentKeyCard } from "./key-card";
import { SetupPromptCard } from "./setup-prompt-card";

interface AgentGuideProps { notebookName?: string; advancedOpen?: boolean }

export function connectionMinutes(lastUsedAt: string | null, now = Date.now()): number | null {
    if (!lastUsedAt || !Number.isFinite(Date.parse(lastUsedAt))) return null;
    return Math.max(0, Math.floor((now - Date.parse(lastUsedAt)) / 60000));
}

/** 连接时间按量级显示：刚刚、分钟、小时、天。 */
export function formatConnectionAge(minutes: number, text: { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string }): string {
    if (minutes < 1) return text.justNow;
    if (minutes < 60) return text.minutesAgo.replace("{n}", String(minutes));
    if (minutes < 1440) return text.hoursAgo.replace("{n}", String(Math.floor(minutes / 60)));
    return text.daysAgo.replace("{n}", String(Math.floor(minutes / 1440)));
}

export function AgentGuide({ notebookName, advancedOpen = false }: AgentGuideProps) {
    const { t } = useLanguage();
    const titleId = useId();
    const [origin, setOrigin] = useState("");
    const [now, setNow] = useState(0);
    const { loaded, tokens, secret, setSecret, busy, message, setMessage, reload, create, revoke } = useAgentTokens();
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 客户端初始化站点地址和刷新时钟
        setOrigin(window.location.origin);
        setNow(Date.now());
        const timer = window.setInterval(() => {
            setNow(Date.now());
            void reload().catch(() => setMessage(t.agentIntegration.failed));
        }, 15000);
        return () => window.clearInterval(timer);
    }, [reload, setMessage, t.agentIntegration.failed]);
    const valid = tokens.filter((item) => !item.revokedAt && (!item.expiresAt || Date.parse(item.expiresAt) > now));
    const lastUsed = valid.map((item) => item.lastUsedAt).filter((value): value is string => !!value).sort().at(-1) ?? null;
    const minutes = connectionMinutes(lastUsed, now);
    return <section className="min-w-0 space-y-4" aria-labelledby={titleId}>
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h3 id={titleId} className="font-semibold">{t.agentIntegration.title}</h3>
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${minutes === null ? "bg-muted-foreground" : "bg-green-600"}`} />
                {minutes === null ? t.agentGuide.waiting : t.agentGuide.connected.replace("{time}", formatConnectionAge(minutes, t.agentGuide))}
            </p>
        </header>
        <SetupPromptCard origin={origin} />
        <AgentKeyCard loaded={loaded} count={valid.length} secret={secret} busy={busy} create={create} hide={() => setSecret("")} />
        {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
        <AgentExamples notebookName={notebookName} />
        <AgentAdvanced origin={origin} advancedOpen={advancedOpen} tokens={tokens} busy={busy} revoke={revoke} />
    </section>;
}
