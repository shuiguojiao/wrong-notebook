"use client";

import { useRef } from 'react';
import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';

interface HistorySheetProps { open: boolean; onClose: () => void; title: string; children: ReactNode; centered?: boolean }

/** 沿用筛选抽屉的 Radix 弹层，关闭时将焦点交回原题目行。 */
export function HistorySheet({ open, onClose, title, children, centered = false }: HistorySheetProps) {
    const { t } = useLanguage();
    const returnFocus = useRef<HTMLElement | null>(null);
    return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
        <DialogPortal><DialogOverlay />
            <DialogPrimitive.Content aria-describedby={undefined} onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus({ preventScroll: true }); }} className={`fixed inset-x-0 bottom-0 z-50 flex h-[90dvh] flex-col rounded-t-2xl border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-card-foreground shadow-xl md:h-[70dvh] ${centered ? "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:h-auto md:max-h-[85dvh] md:w-[min(90vw,860px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl" : ""}`}>
                <div className="mb-3 flex items-center justify-between gap-2">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogClose asChild><Button variant="ghost" className="size-11" aria-label={t.common.close}><X aria-hidden="true" /></Button></DialogClose>
                </div>
                <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
            </DialogPrimitive.Content>
        </DialogPortal>
    </Dialog>;
}
