"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { agentClientConfig } from "@/lib/agent/client-config";

interface TokenRecord {
    id: string;
    name: string;
    tokenPrefix: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
}

/** 账户私有令牌管理；明文仅保留在本次弹窗的内存中。 */
export function AgentIntegrationSettings() {
    const { t } = useLanguage();
    const text = t.agentIntegration;
    const [tokens, setTokens] = useState<TokenRecord[]>([]);
    const [name, setName] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [secret, setSecret] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [origin, setOrigin] = useState("");
    const config = agentClientConfig(origin);

    const reload = useCallback(async () => {
        const response = await fetch("/api/user/agent-tokens", { cache: "no-store" });
        if (!response.ok) throw new Error("AGENT_TOKEN_LOAD_FAILED");
        const data = await response.json();
        setTokens(data.tokens);
        setOrigin(window.location.origin);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开设置时从服务端加载令牌列表
        void reload().catch(() => setMessage(text.failed));
    }, [reload, text.failed]);

    async function create() {
        setBusy(true);
        setMessage("");
        setSecret("");
        try {
            const response = await fetch("/api/user/agent-tokens", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}) }),
            });
            if (!response.ok) {
                setMessage(response.status === 409 ? text.limit : text.failed);
                return;
            }
            const data = await response.json();
            setSecret(data.token);
            setName("");
            await reload();
        } catch { setMessage(text.failed); }
        finally { setBusy(false); }
    }

    async function revoke(id: string) {
        setBusy(true);
        setMessage("");
        try {
            const response = await fetch(`/api/user/agent-tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
            if (!response.ok) throw new Error("AGENT_TOKEN_REVOKE_FAILED");
            setSecret("");
            await reload();
        } catch { setMessage(text.failed); }
        finally { setBusy(false); }
    }

    async function copy() {
        try { await navigator.clipboard.writeText(secret); setMessage(text.copied); }
        catch { setMessage(text.copyFailed); }
    }

    return <section className="min-w-0 space-y-4 rounded-lg border p-4" aria-labelledby="agent-title">
        <h3 id="agent-title" className="font-semibold">{text.title}</h3>
        <p className="text-sm text-muted-foreground">{text.warning}</p>
        <div className="space-y-2">
            <Label htmlFor="agent-token-name">{text.name}</Label>
            <Input id="agent-token-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
            <Label htmlFor="agent-token-expiry">{text.expiresAt}</Label>
            <Input id="agent-token-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            <Button className="min-h-11" disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? text.working : text.create}</Button>
        </div>
        {secret && <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">{text.once}</p>
            <code className="block break-all select-all text-sm">{secret}</code>
            <div className="flex flex-wrap gap-2">
                <Button className="min-h-11" variant="outline" onClick={() => void copy()}>{text.copy}</Button>
                <Button className="min-h-11" variant="outline" onClick={() => setSecret("")}>{text.hide}</Button>
            </div>
        </div>}
        <p role="status" aria-live="polite" className="text-sm">{message}</p>
        <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => void reload().catch(() => setMessage(text.failed))}>{text.refresh}</Button>
        <ul className="space-y-3">
            {tokens.map((token) => <li key={token.id} className="flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 break-words text-sm">
                    <p className="font-medium">{token.name} <code>{token.tokenPrefix}…</code></p>
                    <p>{text.lastUsed}: {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : text.never}</p>
                    <p>{text.expiresAt}: {token.expiresAt ? new Date(token.expiresAt).toLocaleString() : text.never}</p>
                </div>
                <Button className="min-h-11 shrink-0" variant="outline" disabled={busy || !!token.revokedAt} onClick={() => void revoke(token.id)}>{token.revokedAt ? text.revoked : text.revoke}</Button>
            </li>)}
        </ul>
        {!tokens.length && <p className="text-sm text-muted-foreground">{text.empty}</p>}
        <details className="min-w-0 space-y-2">
            <summary className="min-h-11 cursor-pointer py-2 font-medium">{text.configuration}</summary>
            <p className="break-all text-sm">MCP: {config.url}</p>
            <Label>Codex — ~/.codex/config.toml</Label>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{config.codex}</pre>
            <Label>WorkBuddy — MCP JSON</Label>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{config.workbuddy}</pre>
            <p className="text-sm text-muted-foreground">{text.envHint}</p>
        </details>
    </section>;
}
