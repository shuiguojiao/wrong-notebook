"use client";

import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface UploadZoneProps {
    isAnalyzing: boolean;
    onContinueCamera: () => void;
    canContinueCamera?: boolean;
    submittedCount?: number;
}

/** 来源选择统一由 EntrySources 提供，此处只保留提交提示与连续拍题。 */
export function UploadZone({ onContinueCamera, isAnalyzing, canContinueCamera, submittedCount = 0 }: UploadZoneProps) {
    const { t } = useLanguage();
    return <div className="space-y-4">
        {submittedCount > 0 && <p role="status" data-testid="album-submitted">{t.upload.albumSubmitted.replace("{n}", String(submittedCount))}</p>}
        {canContinueCamera && <Button type="button" className="hidden min-h-12 w-full text-base pointer-coarse:flex" onClick={onContinueCamera} disabled={isAnalyzing}>
            <Camera aria-hidden="true" className="h-5 w-5" />{t.upload.continueCamera}
        </Button>}
    </div>;
}
