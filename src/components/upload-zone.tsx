"use client";

import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadZone, isScreenshotSupported } from "@/lib/hooks/use-upload-files";
import { DragDropArea } from "./upload-zone/drag-drop-area";
import { HiddenFileInputs, ImageSourceButtons } from "./upload-zone/image-source-buttons";
import { PasteButton, ScreenshotButton } from "./upload-zone/paste-screenshot-buttons";

interface UploadZoneProps {
    onImageSelect: (file: File) => void;  // 改为传递 File 对象
    isAnalyzing: boolean;
    onImagesSelect?: (files: File[]) => void;
    canContinueCamera?: boolean;
    submittedCount?: number;
}

export function UploadZone({ onImageSelect, onImagesSelect, isAnalyzing, canContinueCamera, submittedCount = 0 }: UploadZoneProps) {
    const zone = useUploadZone({ onImageSelect, onImagesSelect, isAnalyzing });

    return (
        <div className="space-y-4">
            {submittedCount > 0 && <p role="status" data-testid="album-submitted">{zone.t.upload.albumSubmitted.replace("{n}", String(submittedCount))}</p>}
            {canContinueCamera && (
                <Button type="button" className="hidden min-h-12 w-full text-base pointer-coarse:flex" onClick={() => zone.openSource("camera")} disabled={isAnalyzing}>
                    <Camera className="h-5 w-5" />{zone.t.upload.continueCamera}
                </Button>
            )}
            {/* 隐藏的选择器始终存在，桌面端「从文件选择」也可用 */}
            <HiddenFileInputs
                cameraInput={zone.cameraInput}
                albumInput={zone.albumInput}
                fileInput={zone.fileInput}
                handlePicked={zone.handlePicked}
            />
            {/* 触屏设备（手机、平板）显示拍照、相册、文件三个独立入口；用 CSS 媒体查询判断，不依赖渲染时的状态 */}
            {zone.isClient && (
                <ImageSourceButtons
                    openSource={zone.openSource}
                    isAnalyzing={zone.isAnalyzing}
                />
            )}
            <DragDropArea
                getRootProps={zone.getRootProps}
                getInputProps={zone.getInputProps}
                isDragActive={zone.isDragActive}
                isAnalyzing={zone.isAnalyzing}
            />
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-start justify-center gap-4">
                {/* 剪贴板粘贴按钮 - 只在客户端渲染 */}
                {zone.isClient && (
                    <PasteButton
                        onPaste={() => { void zone.handleClipboardRead(); }}
                        isAnalyzing={zone.isAnalyzing}
                    />
                )}
                {/* 屏幕截图按钮 - 只在客户端渲染 */}
                {zone.isClient && isScreenshotSupported(zone.isClient) && (
                    <ScreenshotButton
                        onScreenshot={() => { void zone.handleScreenshot(); }}
                        isAnalyzing={zone.isAnalyzing}
                        isScreenshotting={zone.isScreenshotting}
                    />
                )}
            </div>
        </div>
    );
}
