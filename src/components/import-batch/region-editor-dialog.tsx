"use client";

import { RegionEditor } from "@/components/import-batch/region-editor";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import type { RegionEditorProps } from "@/components/import-batch/region-editor";

interface RegionEditorDialogProps extends RegionEditorProps { open: boolean }

/** 分题草稿沿用原来的弹窗入口，与核对页共用区域编辑器。 */
export function RegionEditorDialog({ open, ...props }: RegionEditorDialogProps) {
    const { t } = useLanguage();
    return <Dialog open={open} onOpenChange={value => { if (!value && !props.busy) props.onClose(); }}>
        <DialogContent className="flex h-[90vh] max-w-3xl flex-col gap-0 p-0">
            <DialogHeader className="shrink-0 border-b p-4">
                <DialogTitle>{t.importBatch.regionDialogTitle}</DialogTitle>
                <DialogDescription>{t.importBatch.regionDialogHint}</DialogDescription>
            </DialogHeader>
            <RegionEditor {...props} />
        </DialogContent>
    </Dialog>;
}
