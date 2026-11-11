"use client";

import { useId, useState } from "react";
import { AgentSkillSettings } from "@/components/settings/agent-skill-settings";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { agentClientConfig } from "@/lib/agent/client-config";
import type { TokenRecord } from "@/lib/hooks/use-agent-tokens";

type Client = "codex" | "claude" | "cursor" | "workbuddy" | "other";
interface AgentAdvancedProps {
    origin: string;
    advancedOpen: boolean;
    tokens: TokenRecord[];
    busy: boolean;
    revoke: (id: string) => Promise<void>;
}

export function AgentAdvanced({ origin, advancedOpen, tokens, busy, revoke }: AgentAdvancedProps) {
    const { t, language } = useLanguage();
    const [client, setClient] = useState<Client>("codex");
    const [message, setMessage] = useState("");
    const clientId = useId();
    const config = agentClientConfig(origin);
    async function copy() {
        try { await navigator.clipboard.writeText(config[client]); setMessage(t.agentIntegration.copied); }
        catch { setMessage(t.agentIntegration.copyFailed); }
    }
    return <details open={advancedOpen} className="min-w-0 rounded-lg border p-4" data-testid="agent-advanced">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">{t.agentGuide.advanced}</summary>
        <div className="min-w-0 space-y-5 pt-3">
            <section className="min-w-0 space-y-3">
                <h4 className="font-semibold">{t.agentIntegration.configuration}</h4>
                <label className="block text-sm" htmlFor={clientId}>{t.agentGuide.chooseClient}</label>
                <select id={clientId} className="min-h-11 w-full rounded-md border bg-background px-3" value={client} onChange={(event) => setClient(event.target.value as Client)}>
                    <option value="codex">Codex</option><option value="claude">Claude Code</option><option value="cursor">Cursor</option><option value="workbuddy">WorkBuddy</option><option value="other">{t.agentGuide.other}</option>
                </select>
                <p className="break-all text-sm">{client === "codex" ? "~/.codex/config.toml" : client === "claude" ? ".mcp.json" : client === "cursor" ? "mcp.json" : "MCP JSON"}</p>
                <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-xs">{config[client]}</pre>
                <p className="text-sm text-muted-foreground">{t.agentIntegration.envHint}</p>
                <Button variant="outline" className="min-h-11" disabled={!origin} onClick={() => void copy()}>{t.agentGuide.copyConfig}</Button>
                {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
            </section>
            <AgentSkillSettings />
            <section className="min-w-0 space-y-3">
                <h4 className="font-semibold">{t.agentGuide.manageKeys}</h4>
                <ul className="space-y-3">
                    {tokens.map((token) => <li key={token.id} className="flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 break-words text-sm">
                            <p className="font-medium">{token.name} <code>{token.tokenPrefix}…</code></p>
                            <p>{t.agentIntegration.lastUsed}: {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString(language) : t.agentIntegration.never}</p>
                            <p>{t.agentIntegration.expiresAt}: {token.expiresAt ? new Date(token.expiresAt).toLocaleString(language) : t.agentIntegration.never}</p>
                        </div>
                        <Button className="min-h-11 shrink-0" variant="outline" disabled={busy || !!token.revokedAt} onClick={() => void revoke(token.id)}>{token.revokedAt ? t.agentIntegration.revoked : t.agentIntegration.revoke}</Button>
                    </li>)}
                </ul>
                {!tokens.length && <p className="text-sm text-muted-foreground">{t.agentIntegration.empty}</p>}
            </section>
        </div>
    </details>;
}
