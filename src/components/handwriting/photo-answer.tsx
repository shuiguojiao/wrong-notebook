"use client";

import { useEffect, useRef, useState } from 'react';
import { ImageCropper } from '@/components/image-cropper';
import { SourceThumb } from '@/components/question/source-thumb';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { compressAnswerPhoto, MAX_ANSWER_PHOTOS, rotateAnswerPhoto } from '@/lib/handwriting/photo';
import { processImageFile } from '@/lib/image-utils';

interface PhotoAnswerProps {
    photos: string[];
    onChange: (photos: string[]) => void;
    onBusyChange?: (busy: boolean) => void;
    readOnly: boolean;
}

export function PhotoAnswer({ photos, onChange, onBusyChange, readOnly }: PhotoAnswerProps) {
    const { t } = useLanguage();
    const camera = useRef<HTMLInputElement>(null);
    const library = useRef<HTMLInputElement>(null);
    const target = useRef<number | null>(null);
    const operation = useRef(0);
    const locked = useRef(false);
    const [busy, setBusy] = useState(false);
    const [cropWorking, setCropWorking] = useState(false);
    const [error, setError] = useState(false);
    const [crop, setCrop] = useState<{ source: string; index: number | null }>();
    useEffect(() => () => { operation.current++; onBusyChange?.(false); }, [onBusyChange]);
    const changeBusy = (value: boolean) => { locked.current = value; setBusy(value); onBusyChange?.(value); };
    const closeCrop = () => { operation.current++; setCrop(undefined); setCropWorking(false); changeBusy(false); };
    const choose = (input: HTMLInputElement | null, index: number | null = null) => {
        target.current = index;
        input?.click();
    };
    async function select(file?: File) {
        if (!file || locked.current || readOnly || (target.current === null && photos.length >= MAX_ANSWER_PHOTOS)) return;
        const index = target.current;
        const current = ++operation.current;
        changeBusy(true); setError(false);
        try {
            const source = await processImageFile(file);
            if (operation.current === current) setCrop({ source, index });
        } catch {
            if (operation.current === current) { setError(true); changeBusy(false); }
        }
    }
    async function confirm(blob: Blob) {
        if (!crop || cropWorking) return;
        const current = ++operation.current;
        const index = crop.index;
        setCrop(undefined);
        try {
            const image = await compressAnswerPhoto(blob);
            if (operation.current !== current) return;
            onChange(index === null ? [...photos, image].slice(0, MAX_ANSWER_PHOTOS) : photos.map((photo, i) => i === index ? image : photo));
        } catch {
            if (operation.current === current) setError(true);
        } finally {
            if (operation.current === current) changeBusy(false);
        }
    }
    async function rotateCrop() {
        if (!crop || cropWorking) return;
        const current = ++operation.current;
        setCropWorking(true);
        try {
            const source = await rotateAnswerPhoto(crop.source);
            if (operation.current === current) setCrop({ ...crop, source });
        } catch {
            if (operation.current === current) { closeCrop(); setError(true); }
        } finally {
            if (operation.current === current) setCropWorking(false);
        }
    }
    async function rotate(index: number) {
        if (locked.current || readOnly) return;
        const current = ++operation.current;
        changeBusy(true); setError(false);
        try {
            const image = await rotateAnswerPhoto(photos[index]);
            if (operation.current === current) onChange(photos.map((photo, i) => i === index ? image : photo));
        } catch {
            if (operation.current === current) setError(true);
        } finally {
            if (operation.current === current) changeBusy(false);
        }
    }
    const disabled = readOnly || busy;
    const full = photos.length >= MAX_ANSWER_PHOTOS;
    return <section aria-label={t.handwriting.photo} aria-busy={busy} className="min-w-0 space-y-3">
        <p className="text-sm text-muted-foreground">{t.handwriting.photoHint}</p>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label={t.handwriting.takePhoto} disabled={disabled}
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void select(file); }} />
        <input ref={library} type="file" accept="image/*" hidden aria-label={t.handwriting.choosePhoto} disabled={disabled}
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void select(file); }} />
        <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={disabled || full} onClick={() => choose(camera.current)}>{t.handwriting.takePhoto}</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={disabled || full} onClick={() => choose(library.current)}>{t.handwriting.choosePhoto}</Button>
        </div>
        <ol className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {photos.map((photo, index) => <li key={index} className="min-w-0 space-y-2 rounded-lg border bg-card p-3">
                <SourceThumb src={photo} alt={`${t.handwriting.photo} ${index + 1}`} />
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => choose(camera.current, index)}>{t.handwriting.retake}</Button>
                    <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => void rotate(index)}>{t.handwriting.rotatePhoto}</Button>
                    <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => onChange(photos.filter((_, i) => i !== index))}>{t.common.delete}</Button>
                </div>
            </li>)}
        </ol>
        {photos.length > 0 && <Button type="button" variant="outline" className="min-h-11" disabled={disabled || full} onClick={() => choose(library.current)}>{t.handwriting.addPhoto}</Button>}
        {full && <p className="text-sm text-muted-foreground">{t.handwriting.photoLimit}</p>}
        {busy && <p role="status" className="text-sm">{t.common.loading}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{t.handwriting.photoUnreadable}</p>}
        {crop && <ImageCropper key={crop.source} open imageSrc={crop.source} allowMulti={false}
            hint={t.handwriting.photoCropHint} busy={cropWorking} onRotate={() => void rotateCrop()} onClose={closeCrop} onCropComplete={blob => void confirm(blob)}
            onError={() => { closeCrop(); setError(true); }} />}
    </section>;
}
