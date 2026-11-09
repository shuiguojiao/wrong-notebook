"use client";

import { X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
    Dialog, DialogClose, DialogDescription, DialogOverlay,
    DialogPortal, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface SourceThumbProps {
    src: string;
    alt: string;
    caption?: string;
    size?: "inline" | "square";
    /** 为后续出处查看提供打开通知，本步仍展示题图本身。 */
    onOpen?: () => void;
    className?: string;
}

export function SourceThumb({ src, alt, caption, size = "inline", onOpen, className }: SourceThumbProps) {
    const { t } = useLanguage();
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
                        <img src={src} alt={alt} loading="lazy" className={size === "square" ? "size-full object-cover" : "max-h-48 w-full object-contain"} />
                    </button>
                </DialogTrigger>
                {caption?.trim() && <figcaption className="mt-2 text-[13px] text-muted-foreground">{caption}</figcaption>}
            </figure>
            <DialogPortal>
                <DialogOverlay />
                <DialogPrimitive.Content
                    {...(!caption?.trim() && { "aria-describedby": undefined })}
                    className="fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 gap-3 overflow-y-auto rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-6"
                >
                    <DialogTitle className="pr-12 text-base">{t.detail.viewImage}</DialogTitle>
                    <DialogClose className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t.common.close}>
                        <X className="size-5" aria-hidden="true" />
                    </DialogClose>
                    <img src={src} alt={alt} className="max-h-[70dvh] w-full rounded-lg object-contain" />
                    {caption?.trim() && <DialogDescription>{caption}</DialogDescription>}
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
