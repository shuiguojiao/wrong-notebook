"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuestionSummary } from "@/components/error-list/question-summary";
import { SourceThumb } from "@/components/question/source-thumb";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/contexts/LanguageContext";
import { getItemTags } from "@/lib/tags/item-tags";
import { cn } from "@/lib/utils";
import type { ErrorItemSummary } from "@/types/api";

interface ErrorRowProps {
    item: ErrorItemSummary;
    preview: string;
    selectMode: boolean;
    selected: boolean;
    onToggleSelect: () => void;
    onLongPress: () => void;
}

/** 紧凑的题目行；长按进入多选，滚动和取消手势不会误选。 */
export function ErrorRow({ item, preview, selectMode, selected, onToggleSelect, onLongPress }: ErrorRowProps) {
    const { t } = useLanguage();
    const router = useRouter();
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const origin = useRef({ x: 0, y: 0 });
    const longPressed = useRef(false);
    const cancelPress = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    const tag = getItemTags(item)[0];
    const mastered = item.masteryStatus === "mastered";
    const href = `/error-items/${item.id}`;
    const activate = () => { if (selectMode) onToggleSelect(); else router.push(href); };

    return (
        <div
            data-testid="error-row"
            className={cn("flex min-h-[76px] items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50 motion-reduce:transition-none sm:px-4", selected && "bg-primary/5")}
            onPointerDown={event => {
                if (event.button !== 0 || selectMode) return;
                cancelPress();
                longPressed.current = false;
                origin.current = { x: event.clientX, y: event.clientY };
                timer.current = setTimeout(() => { longPressed.current = true; onLongPress(); }, 500);
            }}
            onPointerMove={event => {
                if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) cancelPress();
            }}
            onPointerUp={cancelPress}
            onPointerCancel={() => { cancelPress(); longPressed.current = false; }}
            onPointerLeave={cancelPress}
            onContextMenu={event => { if (longPressed.current) event.preventDefault(); }}
            onClick={event => {
                if (!(event.target as HTMLElement).closest("a, button")) activate();
            }}
            onClickCapture={event => {
                if (longPressed.current) { event.preventDefault(); event.stopPropagation(); longPressed.current = false; }
            }}
        >
            {selectMode && <div className="flex size-11 shrink-0 items-center justify-center">
                <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={t.questionSimilarity.selectQuestion.replace("{id}", item.shortId || item.id)} />
            </div>}
            <Link
                href={href}
                className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={event => { if (selectMode) { event.preventDefault(); onToggleSelect(); } }}
            >
                <QuestionSummary text={preview || t.notebook.emptyQuestion} maxLength={180} className="line-clamp-2 text-[15px] leading-5 sm:text-base" />
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] leading-4 text-muted-foreground">
                    {tag && <><span className="truncate">{tag}</span><span aria-hidden="true">·</span></>}
                    <span className={cn("size-1.5 shrink-0 rounded-full", mastered ? "bg-emerald-600 dark:bg-emerald-400" : "bg-orange-500 dark:bg-orange-400")} aria-hidden="true" />
                    <span className="shrink-0">{mastered ? t.notebook.mastered : t.notebook.review}</span>
                </div>
            </Link>
            {item.originalImageUrl && (
                // 列表缩略图只导航或选择；在捕获阶段拦截公共组件的放大操作。
                <div className="shrink-0" onClickCapture={event => { event.preventDefault(); event.stopPropagation(); activate(); }}>
                    <SourceThumb src={item.originalImageUrl} alt={t.review.sourceImage} size="square" />
                </div>
            )}
        </div>
    );
}
