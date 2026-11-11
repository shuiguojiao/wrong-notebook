"use client";

import { useRef } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { Camera, FileUp, Images, PenLine } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { UploadZone } from "@/components/upload-zone";
import { DragDropArea } from "@/components/upload-zone/drag-drop-area";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/lib/feedback";
import { IMAGE_ACCEPT, isScreenshotSupported, useCameraAvailability, useUploadZone } from "@/lib/hooks/use-upload-files";
import { acceptedExtensions, IMPORT_FILE_TYPES } from "@/lib/import/file-read";
import type { EntryMode } from "./entry-panels";

const FILE_ACCEPT = [...Object.keys(IMAGE_ACCEPT), ...Object.values(IMAGE_ACCEPT).flat(), ...IMPORT_FILE_TYPES.flatMap(acceptedExtensions)].join(",");

interface EntrySourcesProps {
    mode: EntryMode;
    onModeChange: (mode: EntryMode) => void;
    onImageSelect: (file: File) => void;
    onImagesSelect: (files: File[]) => void;
    onFileSelect: (file: File) => void;
    isBusy: boolean;
    active?: boolean;
    submittedCount?: number;
    canContinueCamera?: boolean;
}

/** 触屏四格与桌面拖放共用来源选择器；切换来源不卸载下方草稿。 */
export function EntrySources({ mode, onModeChange, onImageSelect, onImagesSelect, onFileSelect, isBusy, active = true, submittedCount, canContinueCamera }: EntrySourcesProps) {
    const { t } = useLanguage();
    const disabled = isBusy || !active;
    const cameraInput = useRef<HTMLInputElement>(null);
    const albumInput = useRef<HTMLInputElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const hasCamera = useCameraAvailability();
    const selectImage = (file: File) => { onModeChange("image"); onImageSelect(file); };
    const zone = useUploadZone({ onImageSelect: selectImage, isAnalyzing: disabled });
    const routeFiles = (files: File[]) => {
        if (disabled || !files.length) return;
        const images = files.filter(file => file.type.toLowerCase().startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name));
        if (images.length === files.length) {
            if (images.length > 20) { toast.warning(t.upload.albumLimit); return; }
            onModeChange("image");
            if (images.length > 1) onImagesSelect(images);
            else onImageSelect(images[0]);
        } else {
            onModeChange("file");
            onFileSelect(files[0]);
        }
    };
    const { getRootProps, isDragActive } = useDropzone({
        onDrop: routeFiles, disabled, noClick: true, noKeyboard: true,
    });
    const pick = (source: "camera" | "album" | "file") => {
        if (disabled) return;
        if (source === "camera" && hasCamera === false) { toast.warning(t.upload.noCamera); return; }
        ({ camera: cameraInput, album: albumInput, file: fileInput })[source].current?.click();
    };
    const picked = (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        // 清空后才能再次选择同名照片或文件。
        event.target.value = "";
        routeFiles(files);
    };
    const textButton = (className: string) => <Button type="button" variant={mode === "text" ? "secondary" : "outline"}
        className={className} disabled={disabled} aria-pressed={mode === "text"} onClick={() => onModeChange("text")}>
        <PenLine aria-hidden="true" />{t.entry.typing}
    </Button>;

    return <div data-entry-sources data-testid="entry-sources" tabIndex={-1} aria-label={t.student.newQuestion}
        className="scroll-mt-4 space-y-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden disabled={disabled} onChange={picked} data-testid="camera-input" />
        <input ref={albumInput} type="file" accept="image/*" multiple hidden disabled={disabled} onChange={picked} data-testid="album-input" />
        <input ref={fileInput} type="file" accept={FILE_ACCEPT} hidden disabled={disabled} onChange={picked} data-testid="file-input" />
        <div className="hidden grid-cols-4 gap-2 pointer-coarse:grid" data-testid="entry-touch-sources">
            <Button type="button" variant="outline" className="h-auto min-h-14 min-w-0 flex-col gap-1 px-1 py-3" disabled={disabled} onClick={() => pick("camera")}><Camera aria-hidden="true" />{t.upload.camera}</Button>
            <Button type="button" variant="outline" className="h-auto min-h-14 min-w-0 flex-col gap-1 px-1 py-3" disabled={disabled} onClick={() => pick("album")}><Images aria-hidden="true" />{t.upload.album}</Button>
            <Button type="button" variant="outline" className="h-auto min-h-14 min-w-0 flex-col gap-1 px-1 py-3" disabled={disabled} onClick={() => pick("file")}><FileUp aria-hidden="true" />{t.entry.files}</Button>
            {textButton("h-auto min-h-14 min-w-0 flex-col gap-1 px-1 py-3")}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 pointer-coarse:hidden" data-testid="entry-desktop-sources">
            <DragDropArea getRootProps={getRootProps} isDragActive={isDragActive} isAnalyzing={disabled} onPick={() => pick("file")}
                onScreenshot={zone.isClient && isScreenshotSupported(zone.isClient) ? () => void zone.handleScreenshot() : undefined} isScreenshotting={zone.isScreenshotting} />
            {textButton("h-auto min-h-14 flex-col gap-2 px-4")}
        </div>
        <Link href="/me#agent-settings" className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t.entry.agentLink}</Link>
        {active && mode === "image" && <UploadZone isAnalyzing={disabled} onContinueCamera={() => pick("camera")} canContinueCamera={canContinueCamera} submittedCount={submittedCount} />}
    </div>;
}
