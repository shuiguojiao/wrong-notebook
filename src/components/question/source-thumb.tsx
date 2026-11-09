"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
    Dialog, DialogClose, DialogDescription, DialogOverlay,
    DialogPortal, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { SourcePageImage } from "@/components/question/source-page-image";
import { SourceViewer } from "@/components/question/source-viewer";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { SourceView } from "@/lib/question/source-view";

interface SourceThumbProps {
    src: string;
    alt: string;
    caption?: string;
    size?: "inline" | "square";
    errorItemId?: string;
    source?: SourceView;
    previewPage?: boolean;
    /** 保留缩略图打开通知，供已有调用方使用。 */
    onOpen?: () => void;
    className?: string;
}

export function SourceThumb({ src, alt, caption, size = "inline", onOpen, className, errorItemId, source, previewPage = false }: SourceThumbProps) {
    const { t } = useLanguage();
    const [retry, setRetry] = useState(0);
    const requestKey = `${errorItemId}/${retry}`;
    const [result, setResult] = useState<{ key: string; data?: SourceView; error?: boolean }>();
    useEffect(() => {
        if (!errorItemId || source !== undefined) return;
        const controller = new AbortController();
        apiClient.get<SourceView>(`/api/error-items/${encodeURIComponent(errorItemId)}/source`, { signal: controller.signal })
            .then(data => { if (!controller.signal.aborted) setResult({ key: requestKey, data }); })
            .catch(() => { if (!controller.signal.aborted) setResult({ key: requestKey, error: true }); });
        return () => controller.abort();
    }, [errorItemId, source, requestKey]);
    const loaded = result?.key === requestKey ? result : undefined;
    const data = source ?? loaded?.data;
    const page = data?.page;
    const regions = data?.regions ?? [];
    const regionCount = data?.pages?.reduce((count, entry) => count + entry.regions.length, 0) ?? regions.length;
    const file = page?.fileName || t.sourceViewer.unnamed;
    const sourceCaption = page ? (page.pageNumber == null ? file : `${file} · ${t.sourceViewer.pageNumber.replace('{number}', String(page.pageNumber))}`) : caption;
    const loading = !!errorItemId && source === undefined && !loaded;
    const image = src || page?.imageUrl;
    if (!image) return null;
    return (
        <Dialog onOpenChange={open => { if (open) onOpen?.(); }}>
            <figure className={cn(size === "square" ? "w-14" : "w-full", className)}>
                <DialogTrigger asChild>
                    <button
                        type="button"
                        aria-label={`${t.detail.viewImage} · ${alt}`}
                        className={cn(
                            "block overflow-hidden rounded-lg border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            size === "square" ? "size-14" : "min-h-11 w-full",
                        )}
                    >
                        {previewPage && page ? (
                            <div className="mx-auto max-w-full p-3" style={{ width: Math.min(256, 448 * page.width / page.height) }}>
                                <SourcePageImage src={page.imageUrl} alt={alt} regions={regions} numbered={regionCount > 1} />
                            </div>
                        ) : (
                            <img data-question-crop src={image} alt={alt} loading="lazy"
                                className={size === "square" ? "size-full object-cover" : "max-h-48 w-full object-contain"} />
                        )}
                    </button>
                </DialogTrigger>
                {sourceCaption?.trim() && <figcaption className="mt-2 text-[13px] text-muted-foreground">{sourceCaption}</figcaption>}
            </figure>
            <DialogPortal>
                <DialogOverlay />
                {page && data ? <SourceViewer key={page.id} source={{ ...data, page }} alt={alt} /> : <DialogPrimitive.Content
                    {...(!caption?.trim() && { "aria-describedby": undefined })}
                    className="fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 gap-3 overflow-y-auto rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-6"
                >
                    <DialogTitle className="pr-12 text-base">{t.detail.viewImage}</DialogTitle>
                    <DialogClose className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t.common.close}>
                        <X className="size-5" aria-hidden="true" />
                    </DialogClose>
                    {loading && <p role="status">{t.common.loading}</p>}
                    {loaded?.error && <div role="alert" className="space-y-2 text-sm">
                        <p>{t.sourceViewer.loadError}</p>
                        <button type="button" className="min-h-11 rounded-md border px-4" onClick={() => setRetry(value => value + 1)}>{t.review.retry}</button>
                    </div>}
                    <img src={image} alt={alt} className="max-h-[70dvh] w-full rounded-lg object-contain" />
                    {caption?.trim() && <DialogDescription>{caption}</DialogDescription>}
                </DialogPrimitive.Content>}
            </DialogPortal>
        </Dialog>
    );
}
