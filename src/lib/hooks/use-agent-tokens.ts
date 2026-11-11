"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export interface TokenRecord {
    id: string;
    name: string;
    tokenPrefix: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
}

export function useAgentTokens(active = true) {
    const { t, language } = useLanguage();
    const text = t.agentIntegration;
    const [loaded, setLoaded] = useState(false);
    const [tokens, setTokens] = useState<TokenRecord[]>([]);
    const [secret, setSecret] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    const reload = useCallback(async () => {
        const response = await fetch("/api/user/agent-tokens", { cache: "no-store" });
        if (!response.ok) throw new Error("AGENT_TOKEN_LOAD_FAILED");
        const data = await response.json();
        setTokens(data.tokens);
        setLoaded(true);
    }, []);

    useEffect(() => {
        if (!active) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开设置时从服务端加载令牌列表
        void reload().catch(() => setMessage(text.failed));
    }, [active, reload, text.failed]);

    async function create(name?: string) {
        const date = new Date();
        const defaultName = text.defaultName
            .replace("{month}", language === "en" ? date.toLocaleString("en", { month: "short" }) : String(date.getMonth() + 1))
            .replace("{day}", String(date.getDate()));
        setBusy(true);
        setMessage("");
        setSecret("");
        try {
            const response = await fetch("/api/user/agent-tokens", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name?.trim() || defaultName }),
            });
            if (!response.ok) {
                setMessage(response.status === 409 ? text.limit : text.failed);
                return;
            }
            const data = await response.json();
            setSecret(data.token);
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

    return { loaded, tokens, secret, setSecret, busy, message, setMessage, reload, create, revoke };
}
