"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface KnowledgeStickerBaseProps {
    name: string;
    subject?: "english" | "math" | "chinese" | "other";
    className?: string;
}

export type KnowledgeStickerProps = KnowledgeStickerBaseProps & (
    | { state: "earned" }
    | { state: "improving"; practiceHref?: string }
    | { state: "missing"; remaining: number; practiceHref?: string }
);

export function KnowledgeSticker(props: KnowledgeStickerProps) {
    const { t } = useLanguage();
    const { name, subject = "other", state, className } = props;
    const remaining = props.state === "missing" && Number.isFinite(props.remaining) ? Math.max(0, Math.trunc(props.remaining)) : 0;
    const status = state === "earned" ? t.student.stickerEarned
        : state === "improving" ? t.student.stickerImproving
            : t.student.stickerMissing.replace("{count}", String(remaining));
    const href = props.state !== "earned" ? props.practiceHref : undefined;
    const stickerClass = cn("student-sticker inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-sm text-secondary-foreground", className);
    const content = <>
        <span className="min-w-0 max-w-full break-words font-medium">{name}</span>
        <span className="max-w-full break-words">{status}</span>
        {href && <span className="mt-auto w-full text-right text-xs">{t.student.practiceSticker}<span aria-hidden="true"> ›</span></span>}
    </>;
    return href ? <Link href={href}
        aria-label={t.student.practiceStickerLabel.replace("{name}", name).replace("{status}", status)}
        className={cn(stickerClass, "min-h-11 min-w-11 flex-col items-start rounded-xl hover:brightness-95 active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}
        data-state={state} data-subject={subject}>{content}</Link>
        : <span className={stickerClass} data-state={state} data-subject={subject}>{content}</span>;
}
