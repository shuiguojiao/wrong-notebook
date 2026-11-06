"use client";

import { useState } from "react";
import { getErrorMessage } from "@/lib/error-message";
import { toast } from "@/lib/feedback";
import { ImageDecodeError, prepareImage } from "@/lib/image-pipeline";
import type { PreparedImage } from "@/lib/image-pipeline";
import { renderRegions } from "@/lib/import/question-import-flow";
import type { BatchImage } from "@/lib/import/question-import-flow";
import type { Translations } from "@/lib/translations";
import type { ProgressStatus } from "@/components/ui/progress-feedback";

interface AlbumImportOptions {
    t: Translations;
    partCount: number;
    setAnalysisStep: (step: ProgressStatus) => void;
    uploadImage: (image: BatchImage) => Promise<unknown>;
    uploadPage: (image: BatchImage) => Promise<unknown>;
}

/** 相册多选逐张解码和释放原图，避免同时持有多张手机原图。 */
export function useAlbumImport({ t, partCount, setAnalysisStep, uploadImage, uploadPage }: AlbumImportOptions) {
    const [submittedCount, setSubmittedCount] = useState(0);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [processing, setProcessing] = useState(false);
    const selectImages = (files: File[]) => {
        if (files.length > 20) { toast.warning(t.upload.albumLimit); return; }
        if (partCount > 0) { toast.warning(t.upload.albumParts); return; }
        setPendingFiles(files);
    };
    const submitAlbum = async (mode: "single" | "pages") => {
        if (processing) return;
        setProcessing(true);
        const files = pendingFiles;
        setPendingFiles([]);
        let submitted = 0;
        setSubmittedCount(0);
        for (const file of files) {
            let prepared: PreparedImage | undefined;
            try {
                setAnalysisStep('compressing');
                prepared = await prepareImage(file);
                const [image] = await renderRegions(prepared, [{ x: 0, y: 0, width: 1, height: 1 }]);
                if (await (mode === "pages" ? uploadPage(image) : uploadImage(image))) submitted++;
                setSubmittedCount(submitted);
            } catch (error) {
                toast.error(error instanceof ImageDecodeError ? t.upload.decodeErrors[error.code].replace("{format}", error.format.toUpperCase()) : getErrorMessage(error));
            } finally {
                prepared?.dispose();
            }
        }
        setAnalysisStep('idle');
        setProcessing(false);
    };
    return { submittedCount, selectImages, pendingFiles, submitAlbum, processing, cancelAlbum: () => setPendingFiles([]) };
}
