"use client";

import Link from "next/link";
import { CloudOff, RotateCw } from "lucide-react";
import { PaperCard } from "@/components/student/paper-card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

export interface NetworkNoticeProps {
    onRetry: () => void;
    retrying?: boolean;
    className?: string;
}

export function NetworkNotice({ onRetry, retrying = false, className }: NetworkNoticeProps) {
    const { t } = useLanguage();
    return (
        <PaperCard className={className}>
            <p role="alert" className="flex items-start gap-2">
                <CloudOff className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <span>{t.student.networkNotice}</span>
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" className="min-h-11 min-w-11 whitespace-normal motion-reduce:transition-none" onClick={onRetry} disabled={retrying} aria-busy={retrying}>
                    <RotateCw aria-hidden="true" />{t.importFlow.retryLoad}
                </Button>
                <Button asChild variant="ghost" className="min-h-11 min-w-11 whitespace-normal motion-reduce:transition-none">
                    <Link href="/">{t.student.backToToday}</Link>
                </Button>
            </div>
        </PaperCard>
    );
}
