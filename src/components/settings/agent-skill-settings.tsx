"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { agentSkillUpdateCommand } from "@/lib/agent/skill-update-command";

export function AgentSkillSettings() {
    const { t } = useLanguage();
    const text = t.agentIntegration;
    const [skill, setSkill] = useState<{ version: number; downloadUrl: string } | null>(null);
    const [message, setMessage] = useState("");
    const command = skill ? agentSkillUpdateCommand(new URL(skill.downloadUrl).origin) : "";

    useEffect(() => {
        const controller = new AbortController();
        void fetch("/api/agent-skill/version", { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error("AGENT_SKILL_LOAD_FAILED");
                setSkill(await response.json());
            })
            .catch(() => { if (!controller.signal.aborted) setMessage(text.skillLoadFailed); });
        return () => controller.abort();
    }, [text.skillLoadFailed]);

    async function copy() {
        try { await navigator.clipboard.writeText(command); setMessage(text.copied); }
        catch { setMessage(text.copyFailed); }
    }

    return <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="min-h-11" variant="outline">
                <a href="/api/agent-skill" download="wrong-notebook-import.zip">{text.downloadSkill}</a>
            </Button>
            {skill && <span className="text-sm text-muted-foreground">{text.skillVersion}: {skill.version}</span>}
        </div>
        <p className="break-words text-sm text-muted-foreground">{text.skillInstallHint}</p>
        {skill && <details className="min-w-0 space-y-2">
            <summary className="min-h-11 cursor-pointer py-2 font-medium">{text.skillUpdateCommand}</summary>
            <p className="break-words text-sm text-muted-foreground">{text.skillUpdateHint}</p>
            <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{command}</code></pre>
            <Button className="min-h-11" variant="outline" onClick={() => void copy()}>{text.copySkillUpdate}</Button>
        </details>}
        {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
    </div>;
}
