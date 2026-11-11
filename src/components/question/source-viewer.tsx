"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { RegionEditor } from "@/components/import-batch/region-editor";
import { SourcePageImage } from "@/components/question/source-page-image";
import { DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import { getApiErrorMessage } from "@/lib/error-message";
import { formatDateTime } from "@/lib/date-time";
import { useSourceTransform } from "@/lib/hooks/use-source-transform";
import type { SourcePageView, SourceRegion, SourceView } from "@/lib/question/source-view";

interface SourceViewerProps {
    source: SourceView & { page: SourcePageView };
    alt: string;
    onReframe?: (pageId: string, regions: SourceRegion[]) => Promise<void>;
    busy?: boolean;
    startEditing?: boolean;
}
interface SourceCanvasProps { page: SourcePageView; regions: SourceRegion[]; alt: string; numbered: boolean }

function SourceCanvas({ page, regions, alt, numbered }: SourceCanvasProps) {
    const { t } = useLanguage();
    const { viewport, transform, zoom, reset, pan, handlers } = useSourceTransform(page, regions);
    const controls = [
        { label: t.sourceViewer.zoomOut, Icon: Minus, action: () => zoom(0.8) },
        { label: t.sourceViewer.zoomIn, Icon: Plus, action: () => zoom(1.25) },
        { label: t.sourceViewer.reset, Icon: RotateCcw, action: reset },
    ];
    return <div className="relative min-h-0 flex-1">
        <div ref={viewport} {...handlers} tabIndex={0} role="region" aria-label={t.sourceViewer.navigation}
            className="absolute inset-0 touch-none overflow-hidden bg-muted/40 outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-ring"
            onKeyDown={event => {
                if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.25); }
                if (event.key === '-') { event.preventDefault(); zoom(0.8); }
                if (event.key === '0') { event.preventDefault(); reset(); }
                const offsets: Record<string, [number, number]> = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };
                const offset = offsets[event.key];
                if (offset) { event.preventDefault(); pan(offset[0], offset[1]); }
            }}>
            <div className="absolute left-0 top-0 origin-top-left cursor-grab active:cursor-grabbing"
                style={{ width: page.width, transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
                <SourcePageImage src={page.imageUrl} alt={alt} regions={regions} scale={transform.scale} numbered={numbered} />
            </div>
        </div>
        <div className="absolute bottom-3 right-3 flex gap-1 rounded-lg border bg-card p-1 shadow-sm">
            {controls.map(({ label, Icon, action }) => <button key={label} type="button" onClick={action} aria-label={label}
                className="flex size-11 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><Icon className="size-5" aria-hidden="true" /></button>)}
        </div>
    </div>;
}

export function SourceViewer({ source, alt, onReframe, busy = false, startEditing = false }: SourceViewerProps) {
    const { t, language } = useLanguage();
    const { timeZone } = useTimeZone();
    const [index, setIndex] = useState(0);
    const [editing, setEditing] = useState(startEditing);
    const [saveError, setSaveError] = useState<string>();
    const pages = source.pages ?? [{ page: source.page, regions: source.regions }];
    const { page, regions } = pages[index] ?? pages[0];
    const origin = t.sourceViewer.origins[page.origin as keyof typeof t.sourceViewer.origins] ?? page.origin;
    const file = page.fileName?.trim();
    const caption = file ? (page.pageNumber == null ? file : `${file} · ${t.sourceViewer.pageNumber.replace('{number}', String(page.pageNumber))}`) : undefined;
    return <DialogPrimitive.Content {...(!caption && { "aria-describedby": undefined })} className="fixed inset-0 z-50 flex h-dvh w-screen flex-col bg-background text-foreground shadow-xl">
        <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <DialogClose disabled={busy} className="flex size-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" aria-label={t.common.close}><X className="size-5" aria-hidden="true" /></DialogClose>
            <DialogTitle className={caption ? "text-base" : "sr-only"}>{caption ? t.sourceViewer.title : t.sourceViewer.original}</DialogTitle>
            <div className="col-start-3 flex justify-end">{onReframe && <button type="button" disabled={busy} className="min-h-11 px-2 text-sm font-medium text-primary" onClick={() => setEditing(true)}>{t.checks.reframe}</button>}</div>
        </header>
        {editing && onReframe ? <RegionEditor key={`${page.id}:${source.updatedAt ?? ""}`} imageUrl={page.imageUrl} regions={regions}
            busy={busy} saveLabel={t.checks.saveRegions} errorMessage={saveError} maxRegions={4 - pages.filter(entry => entry.page.id !== page.id).reduce((sum, entry) => sum + entry.regions.length, 0)}
            onClose={() => setEditing(false)} onSave={next => {
                setSaveError(undefined);
                void onReframe(page.id, next.map((region, order) => ({ ...region, order }))).then(() => setEditing(false)).catch(error => {
                    setSaveError(getApiErrorMessage(error) === "CHECK_CONFLICT" ? t.checks.conflict : t.checks.failed);
                });
            }} /> : <SourceCanvas key={page.id} page={page} regions={regions} alt={alt} numbered={pages.reduce((count, entry) => count + entry.regions.length, 0) > 1} />}
        <footer className="shrink-0 space-y-1 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {pages.length > 1 && <label className="flex items-center gap-2 text-sm">{t.sourceViewer.selectPage}
                <select disabled={busy} className="min-h-11 rounded-md border bg-background px-2" value={index} onChange={event => setIndex(Number(event.target.value))}>
                    {pages.map((entry, pageIndex) => <option key={entry.page.id} value={pageIndex}>{entry.page.pageNumber == null ? pageIndex + 1 : t.sourceViewer.pageNumber.replace('{number}', String(entry.page.pageNumber))}</option>)}
                </select>
            </label>}
            {caption && <DialogDescription className="break-words text-sm text-foreground">{caption}</DialogDescription>}
            <p className="text-[13px] text-muted-foreground">{formatDateTime(page.createdAt, language === 'zh' ? 'M月d日' : 'MMM d', timeZone)} · {origin}</p>
        </footer>
    </DialogPrimitive.Content>;
}
