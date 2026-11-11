"use client";

import type { HTMLAttributes } from "react";
import { Loader2, Monitor, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface DragDropAreaProps {
    getRootProps: () => HTMLAttributes<HTMLElement>;
    isDragActive: boolean;
    isAnalyzing: boolean;
    onPick: () => void;
    onScreenshot?: () => void;
    isScreenshotting?: boolean;
}

/** 桌面图片与题库文件共用拖放区，截图按钮与主选择按钮互不嵌套。 */
export function DragDropArea({ getRootProps, isDragActive, isAnalyzing, onPick, onScreenshot, isScreenshotting }: DragDropAreaProps) {
    const { t } = useLanguage();
    return <div {...getRootProps()} className={`min-w-0 rounded-xl border-2 border-dashed bg-card p-2 ${isDragActive ? "border-primary bg-accent" : "border-border"}`}>
        <button type="button" disabled={isAnalyzing} onClick={onPick} data-testid="entry-file-picker"
            className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-lg px-3 py-4 text-center text-sm hover:bg-accent/40 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            {isAnalyzing ? <Loader2 aria-hidden="true" className="size-6 animate-spin" /> : <UploadCloud aria-hidden="true" className="size-6 text-primary" />}
            <span>{isAnalyzing ? t.app.analyzing : t.entry.dropFiles}</span>
        </button>
        {onScreenshot && <Button type="button" variant="link" size="sm" className="mx-auto flex text-xs" onClick={onScreenshot} disabled={isAnalyzing || isScreenshotting}>
            {isScreenshotting ? <Loader2 aria-hidden="true" className="size-3 animate-spin" /> : <Monitor aria-hidden="true" className="size-3" />}{t.upload.screenshot}
        </Button>}
    </div>;
}
