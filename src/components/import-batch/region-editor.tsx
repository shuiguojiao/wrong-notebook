"use client";

import { useState } from "react";
import ReactCrop from "react-image-crop";
import type { PercentCrop } from "react-image-crop";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { MAX_ITEM_REGIONS } from "@/lib/question-split/draft";
import { fromCrop, toCrop } from "@/lib/question/region-crop";
import { cn } from "@/lib/utils";
import type { DraftRegion } from "@/lib/question-split/draft";
import "react-image-crop/dist/ReactCrop.css";

export interface RegionEditorProps {
    imageUrl: string;
    regions: DraftRegion[];
    onClose: () => void;
    onSave: (regions: DraftRegion[]) => void;
    saveLabel?: string;
    busy?: boolean;
    maxRegions?: number;
    errorMessage?: string;
}

const DEFAULT_REGION: DraftRegion = { x: 0.1, y: 0.1, width: 0.8, height: 0.3 };

/** 共用触控、鼠标和键盘框选交互，既可嵌入整页查看器，也可用于分题弹窗。 */
export function RegionEditor({ imageUrl, regions, onClose, onSave, saveLabel, busy = false, maxRegions = MAX_ITEM_REGIONS, errorMessage }: RegionEditorProps) {
    const { t } = useLanguage();
    const [crops, setCrops] = useState<PercentCrop[]>(() => (regions.length ? regions : [DEFAULT_REGION]).map(toCrop));
    const [active, setActive] = useState(0);
    const current = crops[Math.min(active, crops.length - 1)];

    const save = () => {
        const next = crops.map(fromCrop);
        if (next.every((region): region is DraftRegion => region !== null)) onSave(next);
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto bg-black p-3">
                <div className="relative mx-auto w-fit">
                    <ReactCrop disabled={busy} crop={current} onChange={(_, percent) => setCrops((list) => list.map((crop, index) => (index === active ? percent : crop)))}>
                        <img src={imageUrl} alt="" className="block max-h-[65vh] max-w-full" draggable={false} />
                    </ReactCrop>
                    {crops.map((crop, index) => index !== active && <div key={index} aria-hidden="true" className="pointer-events-none absolute rounded border-2 border-blue-500"
                        style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }} />)}
                </div>
            </div>
            <div className="shrink-0 space-y-3 border-t p-4">
                <div className="flex flex-wrap items-center gap-2">
                    {crops.map((_, index) => (
                        <button
                            key={index}
                            type="button"
                            disabled={busy}
                            aria-pressed={index === active}
                            onClick={() => setActive(index)}
                            className={cn("min-h-11 rounded-md border px-3 py-1 text-sm", index === active ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground")}
                        >
                            {t.importBatch.regionTab.replace("{index}", String(index + 1))}
                        </button>
                    ))}
                    {crops.length < maxRegions && (
                        <Button type="button" disabled={busy} className="min-h-11" size="sm" variant="ghost" onClick={() => {
                            setCrops((list) => [...list, toCrop(DEFAULT_REGION)]);
                            setActive(crops.length);
                        }}>
                            <Plus className="mr-1 h-4 w-4" />{t.importBatch.addRegion}
                        </Button>
                    )}
                    {crops.length > 1 && (
                        <Button type="button" disabled={busy} size="sm" variant="ghost" className="min-h-11 text-destructive" onClick={() => {
                            setCrops((list) => list.filter((_, index) => index !== active));
                            setActive(0);
                        }}>
                            <Trash2 className="mr-1 h-4 w-4" />{t.importBatch.removeRegion}
                        </Button>
                    )}
                </div>
                {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t.common.cancel}</Button>
                    <Button type="button" disabled={busy || crops.some(crop => !fromCrop(crop))} onClick={save}>{saveLabel ?? t.importBatch.saveRegion}</Button>
                </div>
            </div>
        </div>
    );
}
