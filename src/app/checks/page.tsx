"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckQuestionCard } from "@/components/checks/check-question-card";
import { PageExits } from "@/components/page-exits";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/page-loading";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/error-message";
import { confirmDialog } from "@/lib/feedback";
import { usePageTitle } from "@/lib/page-title";
import type { PendingChecks, PendingQuestion } from "@/lib/question/pending-checks";
import type { SourceRegion } from "@/lib/question/source-view";

function ChecksContent() {
    const { t } = useLanguage();
    const router = useRouter();
    const targetId = useSearchParams().get("id");
    usePageTitle(t.checks.title);
    const [items, setItems] = useState<PendingQuestion[]>();
    const [total, setTotal] = useState(0);
    const [busy, setBusy] = useState(false);
    const cardStartedAt = useRef(0);
    const currentCardId = items?.[0]?.id;
    const currentCardVersion = items?.[0]?.updatedAt;
    useEffect(() => { cardStartedAt.current = Date.now(); }, [currentCardId, currentCardVersion]);
    const locked = useRef(false);
    const [error, setError] = useState<string>();
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        apiClient.get<PendingChecks>("/api/checks/pending", { signal: controller.signal }).then(data => {
            if (!controller.signal.aborted) {
                const target = data.items.find(item => item.id === targetId);
                setItems(target ? [target, ...data.items.filter(item => item.id !== targetId)] : data.items);
                setTotal(data.total);
            }
        }).catch(() => { if (!controller.signal.aborted) setError(t.checks.failed); });
        return () => controller.abort();
    }, [retry, targetId, t.checks.failed]);
    const back = () => { if (window.history.length > 1) router.back(); else router.push("/"); };
    const refresh = async () => {
        const data = await apiClient.get<PendingChecks>("/api/checks/pending");
        // 本轮只处理进入时的题目，后台新发现的问题留待下次打开。
        setItems(previous => previous?.flatMap(item => {
            const current = data.items.find(row => row.id === item.id);
            return current ? [current] : [];
        }));
    };
    const resolve = async (action: string, extra: Record<string, unknown> = {}) => {
        const item = items?.[0];
        if (!item || locked.current) return;
        locked.current = true;
        setBusy(true);
        setError(undefined);
        try {
            if (action === "delete" && !await confirmDialog(t.common.messages.confirmDelete, { destructive: true })) return;
            await apiClient.post(`/api/checks/${encodeURIComponent(item.id)}/resolve`, {
                action, updatedAt: item.updatedAt, durationMs: Math.min(3_600_000, Math.max(0, Date.now() - cardStartedAt.current)),
                ...(action === "delete" ? { confirm: true } : action === "reframe" ? {} : { issueIndex: item.issues[0].index }), ...extra,
            });
            await refresh();
        } catch (caught) {
            const code = getApiErrorMessage(caught);
            const message = code === "CHECK_TEXT_NOT_FOUND" ? t.checks.textNotFound
                : code === "CHECK_CONFLICT" || code === "CHECK_ISSUE_GONE" ? t.checks.conflict
                : code === "CHECK_NO_SUGGESTION" ? t.checks.noSuggestion
                : code === "CHECK_SOURCE_REQUIRED" ? t.checks.sourceRequired : t.checks.failed;
            setError(message);
            if (code === "CHECK_CONFLICT" || code === "CHECK_ISSUE_GONE") await refresh().catch(() => undefined);
            if (action === "reframe") throw caught;
        } finally { locked.current = false; setBusy(false); }
    };
    return <main className="min-h-screen bg-muted/40 px-4 py-4 sm:px-6"><div className="mx-auto max-w-2xl space-y-4">
        {error && <div role="alert" className="rounded-lg border bg-card p-4 text-destructive">{error}<Button variant="link" onClick={() => { setError(undefined); if (items) void refresh().catch(() => setError(t.checks.failed)); else setRetry(value => value + 1); }}>{t.review.retry}</Button><PageExits /></div>}
        {!items && !error && <PageLoading />}
        {items?.[0] && <CheckQuestionCard key={`${items[0].id}:${items[0].updatedAt}`} item={items[0]} position={total - items.length + 1} total={total} busy={busy} onClose={back}
            onResolve={resolve} onReframe={(pageId: string, regions: SourceRegion[]) => resolve("reframe", { pageId, regions: regions.map(({ x, y, width, height }) => ({ x, y, width, height })) })}
            onReplaced={() => void refresh().catch(() => setError(t.checks.failed))} />}
        {items?.length === 0 && <section aria-live="polite" className="space-y-6 rounded-xl border bg-card p-6 text-center"><h1 className="text-xl font-semibold">{t.checks.done}</h1><p className="text-sm text-muted-foreground">{t.checks.emptyHint}</p><Button onClick={back}>{t.checks.back}</Button><PageExits /></section>}
    </div></main>;
}

export default function ChecksPage() {
    return <Suspense fallback={<PageLoading />}><ChecksContent /></Suspense>;
}
