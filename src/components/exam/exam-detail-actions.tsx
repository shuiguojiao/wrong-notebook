"use client";

import Link from "next/link";
import { ClipboardCheck, Loader2, MoreHorizontal, Printer, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ExamAttemptKind } from "@/types/api";

interface ExamDetailActionsProps {
    paperId: string;
    readyCount: number;
    generating: boolean;
    recordable: boolean;
    starting: boolean;
    continueLabel?: string;
    hasFailed: boolean;
    retryRunning: boolean;
    onStart: (kind: ExamAttemptKind) => Promise<void>;
    onRetry: () => Promise<void>;
    onDelete: () => Promise<void>;
}

/** 高频作答操作在前，手机删除入口收进末尾菜单。 */
export function ExamDetailActions({
    paperId, readyCount, generating, recordable, starting, continueLabel,
    hasFailed, retryRunning, onStart, onRetry, onDelete,
}: ExamDetailActionsProps) {
    const { t } = useLanguage();
    const canAnswer = readyCount > 0 && !generating;
    return (
        <div className="flex flex-wrap gap-2">
            {canAnswer && (
                <Button className="min-h-11" disabled={starting} onClick={() => void onStart("online")}>
                    {continueLabel ?? t.examAnswering.start}
                </Button>
            )}
            <Button asChild variant="outline" className="min-h-11" disabled={readyCount === 0}>
                <Link href={`/exams/${paperId}/print`} aria-disabled={readyCount === 0} onClick={(event) => { if (readyCount === 0) event.preventDefault(); }}>
                    <Printer aria-hidden="true" className="mr-2 h-4 w-4" />
                    {t.exam.print}
                </Link>
            </Button>
            {canAnswer && (
                <Button variant="outline" className="min-h-11" disabled={starting} onClick={() => void onStart("photo")}>{t.examPhoto.title}</Button>
            )}
            {recordable && (
                <Button variant="outline" className="min-h-11" disabled={starting} onClick={() => void onStart("manual")}>
                    <ClipboardCheck aria-hidden="true" className="mr-2 h-4 w-4" />
                    {t.examAttempt.manualEntry}
                </Button>
            )}
            {hasFailed && !generating && (
                <Button variant="outline" className="min-h-11" onClick={() => void onRetry()} disabled={retryRunning}>
                    {retryRunning ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" />}
                    {retryRunning ? t.exam.questionPending : t.exam.retryFailed}
                </Button>
            )}
            <div className="ml-auto sm:hidden">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="min-h-11">
                            <MoreHorizontal aria-hidden="true" className="mr-2 h-4 w-4" />
                            {t.exam.moreActions}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => void onDelete()} className="min-h-11 text-destructive focus:text-destructive">
                            <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
                            {t.exam.delete}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <Button variant="ghost" onClick={() => void onDelete()} className="hidden min-h-11 text-destructive hover:text-destructive sm:ml-auto sm:inline-flex">
                <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
                {t.exam.delete}
            </Button>
        </div>
    );
}
