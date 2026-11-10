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
    | { state: "earned" | "improving" }
    | { state: "missing"; remaining: number; practiceHref?: string }
);

export function KnowledgeSticker(props: KnowledgeStickerProps) {
    const { t } = useLanguage();
    const { name, subject = "other", state, className } = props;
    const remaining = props.state === "missing" && Number.isFinite(props.remaining) ? Math.max(0, Math.trunc(props.remaining)) : 0;
    const status = state === "earned" ? t.student.stickerEarned
        : state === "improving" ? t.student.stickerImproving
            : t.student.stickerMissing.replace("{count}", String(remaining));
    return (
        <span className={cn("inline-flex max-w-full flex-wrap items-center gap-2", className)}>
            <span className="student-sticker inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-sm text-secondary-foreground" data-state={state} data-subject={subject}>
                <span className="break-words font-medium">{name}</span>
                <span>{status}</span>
            </span>
            {props.state === "missing" && props.practiceHref && (
                <Link className="student-action inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={props.practiceHref}>
                    {t.student.practiceSticker}
                </Link>
            )}
        </span>
    );
}
