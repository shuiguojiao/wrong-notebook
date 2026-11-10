"use client";

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { composeAnswerImages } from '@/lib/handwriting/compose';
import { exportInk } from '@/lib/handwriting/render';
import { emptyHistory } from '@/lib/handwriting/strokes';
import type { AnswerInputMode } from '@/components/handwriting/answer-input';

/** 图片在提交时生成，失败保留向量草稿；识别结果不覆盖用户键盘输入。 */
export function useHandwrittenAnswer() {
    const { t } = useLanguage();
    const [photos, setPhotos] = useState<string[]>([]);
    const [photoBusy, setPhotoBusy] = useState(false);
    const [answerMode, setAnswerMode] = useState<AnswerInputMode>('keyboard');
    const [ink, setInk] = useState(emptyHistory);
    const [answerImages, setAnswerImages] = useState<string[]>([]);
    const [answerImage, setAnswerImage] = useState<string>();
    const [recognizedAnswer, setRecognizedAnswer] = useState<string>();
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const lock = useRef(false);
    async function prepareImage(): Promise<{ images: string[] } | null> {
        if (lock.current || photoBusy) return null;
        lock.current = true; setExporting(true); setExportError(null);
        try {
            const images = [...await exportInk(ink.strokes), ...photos];
            if (images.length > 4) {
                setExportError(t.handwriting.tooManyImages);
                return null;
            }
            const displayImage = images.length ? await composeAnswerImages(images) : undefined;
            setAnswerImages(images);
            setAnswerImage(displayImage);
            return { images };
        } catch {
            setExportError(t.handwriting.exportFailed);
            return null;
        } finally { lock.current = false; setExporting(false); }
    }
    function resetInk() {
        setPhotos([]); setAnswerMode('keyboard'); setInk(emptyHistory()); setAnswerImages([]); setAnswerImage(undefined); setRecognizedAnswer(undefined); setExportError(null);
    }
    return { photos, setPhotos, photoBusy, setPhotoBusy, answerMode, setAnswerMode, ink, setInk, answerImages, answerImage, recognizedAnswer, setRecognizedAnswer, exporting, exportError, prepareImage, resetInk };
}
