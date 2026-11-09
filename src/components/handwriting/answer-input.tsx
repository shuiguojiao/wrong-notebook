"use client";

import { useLayoutEffect, useRef, useState } from 'react';
import { HandwritingCanvas } from '@/components/handwriting/handwriting-canvas';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import type { InkHistory } from '@/lib/handwriting/strokes';

interface AnswerInputProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    history: InkHistory;
    onInkChange: (history: InkHistory) => void;
    readOnly: boolean;
    error?: string | null;
    compact?: boolean;
    variant?: "default" | "card";
    validationError?: string | null;
}
export function AnswerInput({ id, value, onChange, history, onInkChange, readOnly, error, compact = false, variant = "default", validationError }: AnswerInputProps) {
    const { t } = useLanguage();
    const [mode, setMode] = useState<'keyboard' | 'handwriting'>('keyboard');
    const textarea = useRef<HTMLTextAreaElement>(null);
    const card = variant === 'card';
    useLayoutEffect(() => {
        if (!card || mode !== 'keyboard' || !textarea.current) return;
        const field = textarea.current;
        const resize = () => {
            field.style.height = 'auto';
            const lineHeight = Number.parseFloat(getComputedStyle(field).lineHeight) || 24;
            const height = Math.min(Math.max(field.scrollHeight, 3 * lineHeight + 18), 12 * lineHeight + 18);
            field.style.height = `${height}px`;
        };
        resize();
        window.addEventListener('resize', resize);
        return () => { window.removeEventListener('resize', resize); field.style.removeProperty('height'); };
    }, [card, mode, value]);
    const dots = (label: string, filled: boolean) => <span className="inline-flex items-center gap-1.5">{label}
        {filled && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}</span>;
    return <div className="flex flex-1 flex-col gap-3">
        {card ? <SegmentedControl size="compact" aria-label={t.handwriting.inputMode} value={mode} onChange={setMode}
            options={[
                { value: 'keyboard', label: dots(t.review.typing, !!value.trim()), id: `${id}-typing-tab`, panelId: `${id}-typing-panel` },
                { value: 'handwriting', label: dots(t.handwriting.handwriting, !!history.strokes.length), id: `${id}-ink-tab`, panelId: `${id}-ink-panel` },
            ]} /> : <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.handwriting.inputMode}>
            <Button type="button" className="min-h-11" variant={mode === 'keyboard' ? 'secondary' : 'outline'} aria-pressed={mode === 'keyboard'} onClick={() => setMode('keyboard')}>{t.handwriting.keyboard}{value.trim() ? ' •' : ''}</Button>
            <Button type="button" className="min-h-11" variant={mode === 'handwriting' ? 'secondary' : 'outline'} aria-pressed={mode === 'handwriting'} onClick={() => setMode('handwriting')}>{t.handwriting.handwriting}{history.strokes.length ? ' •' : ''}</Button>
        </div>}
        {!card && !compact && <p className="text-xs text-muted-foreground">{t.handwriting.combinedHint}</p>}
        <div id={card ? `${id}-typing-panel` : undefined} role={card ? 'tabpanel' : undefined} aria-labelledby={card ? `${id}-typing-tab` : undefined} hidden={mode !== 'keyboard'} className={compact && mode === 'keyboard' ? 'flex min-h-0 flex-1 flex-col' : undefined}>
            <label className={compact || card ? "sr-only" : "mb-2 block font-medium"} htmlFor={id}>{t.app.yourAnswer}</label>
            <Textarea ref={textarea} id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={5000} disabled={readOnly}
                rows={card ? 3 : 4} placeholder={card ? t.review.answerPlaceholder : undefined}
                aria-invalid={validationError ? true : undefined} aria-describedby={validationError ? `${id}-error` : undefined}
                className={card ? 'field-sizing-fixed resize-none overflow-y-auto text-base leading-6 md:text-base' : compact ? 'min-h-40 flex-1 field-sizing-fixed' : undefined} />
        </div>
        <div id={card ? `${id}-ink-panel` : undefined} role={card ? 'tabpanel' : undefined} aria-labelledby={card ? `${id}-ink-tab` : undefined} className={mode === 'handwriting' ? 'flex flex-1 flex-col' : 'hidden'}>
            <HandwritingCanvas history={history} onChange={onInkChange} readOnly={readOnly} compact={compact || card} />
        </div>
        {validationError && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{validationError}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>;
}
