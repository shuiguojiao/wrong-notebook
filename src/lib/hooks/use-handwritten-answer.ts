"use client";

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { prepareAnswerImages } from '@/lib/handwriting/prepare-answer';
import type { InkHistory } from '@/lib/handwriting/strokes';
import { emptyHistory } from '@/lib/handwriting/strokes';
import type { AnswerInputMode } from '@/components/handwriting/answer-input';

/** 图片在提交时生成，失败保留向量草稿；识别结果不覆盖用户键盘输入。 */
export function useHandwrittenAnswer(initial?: { photos: string[]; ink: InkHistory; mode: AnswerInputMode }) {
    const { t } = useLanguage();
    const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
    const [photoBusy, setPhotoBusy] = useState(false);
    const [answerMode, setAnswerMode] = useState<AnswerInputMode>(initial?.mode ?? 'keyboard');
    const [ink, setInk] = useState(initial?.ink ?? emptyHistory);
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
            const { images, displayImage } = await prepareAnswerImages(ink, photos);
            setAnswerImages(images);
            setAnswerImage(displayImage);
            return { images };
        } catch (error) {
            setExportError(error instanceof Error && error.message === 'TOO_MANY_ANSWER_IMAGES' ? t.handwriting.tooManyImages : t.handwriting.exportFailed);
            return null;
        } finally { lock.current = false; setExporting(false); }
    }
    function resetInk() {
        setPhotos([]); setAnswerMode('keyboard'); setInk(emptyHistory()); setAnswerImages([]); setAnswerImage(undefined); setRecognizedAnswer(undefined); setExportError(null);
    }
    return { photos, setPhotos, photoBusy, setPhotoBusy, answerMode, setAnswerMode, ink, setInk, answerImages, answerImage, recognizedAnswer, setRecognizedAnswer, exporting, exportError, prepareImage, resetInk };
}
