"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AgentSetupPrompt } from "@/components/settings/agent-setup-prompt";
import { AgentSkillSettings } from "@/components/settings/agent-skill-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { agentClientConfig } from "@/lib/agent/client-config";
import { useAgentTokens } from "@/lib/hooks/use-agent-tokens";

type Client = "codex" | "claude" | "cursor" | "workbuddy" | "other";
interface AgentGuideProps { notebookName?: string }

export function connectionMinutes(lastUsedAt: string | null, now = Date.now()): number | null {
    if (!lastUsedAt || !Number.isFinite(Date.parse(lastUsedAt))) return null;
    return Math.max(0, Math.floor((now - Date.parse(lastUsedAt)) / 60000));
}

export function AgentGuide({ notebookName }: AgentGuideProps) {
    const { t } = useLanguage();
    const text = t.agentGuide;
    const tokenText = t.agentIntegration;
    const [client, setClient] = useState<Client>("codex");
    const [origin, setOrigin] = useState("");
    const [now, setNow] = useState(0);
    const [copyMessage, setCopyMessage] = useState("");
    const { loaded, tokens, name, setName, secret, setSecret, busy, message, setMessage, reload, create } = useAgentTokens();
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 客户端初始化站点地址
        setOrigin(window.location.origin);
        setNow(Date.now());
        const timer = window.setInterval(() => { setNow(Date.now()); void reload().catch(() => setMessage(tokenText.failed)); }, 15000);
        return () => window.clearInterval(timer);
    }, [reload, setMessage, tokenText.failed]);
    const valid = tokens.filter((item) => !item.revokedAt && (!item.expiresAt || Date.parse(item.expiresAt) > now));
    const lastUsed = valid.map((item) => item.lastUsedAt).filter((value): value is string => !!value).sort().at(-1) ?? null;
    const minutes = connectionMinutes(lastUsed, now);
    const config = agentClientConfig(origin);
    const examples = [text.exampleImport.replace("{notebook}", notebookName || text.defaultNotebook), text.exampleTags, text.exampleSearch, text.exampleDuplicate];
    async function copy(value: string) {
        try { await navigator.clipboard.writeText(value); setCopyMessage(tokenText.copied); }
        catch { setCopyMessage(tokenText.copyFailed); }
    }
    return <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <section className="min-w-0 space-y-3 rounded-lg border p-4">
            <h3 className="font-semibold">1. {text.client}</h3>
            <label className="block text-sm" htmlFor="agent-client">{text.chooseClient}</label>
            <select id="agent-client" className="min-h-11 w-full rounded-md border bg-background px-3" value={client} onChange={(event) => setClient(event.target.value as Client)}>
                <option value="codex">Codex</option><option value="claude">Claude Code</option><option value="cursor">Cursor</option><option value="workbuddy">WorkBuddy</option><option value="other">{text.other}</option>
            </select>
            <p className="text-sm">{client === "codex" ? "~/.codex/config.toml" : client === "claude" ? ".mcp.json" : client === "cursor" ? "mcp.json" : "MCP JSON"}</p>
            <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-xs">{config[client]}</pre>
            <Button variant="outline" className="min-h-11" onClick={() => void copy(config[client])}>{text.copyConfig}</Button>
            {origin && <AgentSetupPrompt origin={origin} direct />}
        </section>
        <section className="min-w-0 space-y-3 rounded-lg border p-4">
            <h3 className="font-semibold">2. {tokenText.create}</h3>
            <p className="text-sm text-muted-foreground">{tokenText.warning}</p>
            <p className="text-sm">{valid.length ? text.tokenCount.replace("{count}", String(valid.length)) : text.noToken}</p>
            <Label htmlFor="guide-token-name">{tokenText.name}</Label>
            <Input id="guide-token-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
            <Button className="min-h-11" disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? tokenText.working : tokenText.create}</Button>
            {secret && <div className="space-y-2 rounded-md border p-3"><p>{tokenText.once}</p><code className="block break-all select-all">{secret}</code><p className="text-sm">{text.envHint}</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void copy(secret)}>{tokenText.copy}</Button><Button variant="outline" onClick={() => setSecret("")}>{tokenText.hide}</Button></div></div>}
            <Button asChild variant="outline" className="min-h-11"><Link href="/me#agent-settings">{text.manage}</Link></Button>
            {message && <p role="status">{message}</p>}
        </section>
        <section className="space-y-3 rounded-lg border p-4">
            <h3 className="font-semibold">3. {text.connection}</h3>
            <p>{!loaded ? (message || text.loading) : minutes === null ? text.waiting : text.connected.replace("{minutes}", String(minutes))}</p>
            <Button variant="outline" className="min-h-11" onClick={() => void reload().catch(() => setMessage(tokenText.failed))}>{tokenText.refresh}</Button>
        </section>
        <section className="min-w-0 space-y-3 rounded-lg border p-4"><h3 className="font-semibold">4. Skill</h3><AgentSkillSettings /></section>
        <section className="min-w-0 space-y-3 rounded-lg border p-4 md:col-span-2">
            <h3 className="font-semibold">5. {text.examples}</h3>
            {examples.map((example) => <div key={example} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"><p className="min-w-0 break-words text-sm">{example}</p><Button variant="outline" className="min-h-11" onClick={() => void copy(example)}>{text.copyExample}</Button></div>)}
        </section>
        {copyMessage && <p role="status" className="text-sm">{copyMessage}</p>}
    </div>;
}
