"use client";

import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { InkWorkspace } from '@/components/handwriting/ink-workspace';
import type { InkQuestion } from '@/components/handwriting/ink-workspace';
import { PhotoAnswer } from '@/components/handwriting/photo-answer';
import { HandwritingCanvas } from '@/components/handwriting/handwriting-canvas';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import type { InkHistory } from '@/lib/handwriting/strokes';

export type AnswerInputMode = 'keyboard' | 'handwriting' | 'photo';

interface AnswerInputProps {
    question?: InkQuestion;
    submitted?: boolean;
    photos: string[];
    onPhotosChange: (photos: string[]) => void;
    onPhotoBusyChange?: (busy: boolean) => void;
    mode?: AnswerInputMode;
    onModeChange?: (mode: AnswerInputMode) => void;
    topAction?: ReactNode;
    onPenActivity?: (down: boolean) => void;
    id: string;
    value: string;
    onChange: (value: string) => void;
    history: InkHistory;
    onInkChange: (history: InkHistory) => void;
    readOnly: boolean;
    error?: string | null;
    compact?: boolean;
    variant?: "default" | "card" | "review";
    validationError?: string | null;
}
export function AnswerInput({ photos, onPhotosChange, onPhotoBusyChange, mode: controlledMode, onModeChange, id, value, onChange, history, onInkChange, readOnly, error, compact = false, variant = "default", validationError, topAction, onPenActivity, question, submitted = false }: AnswerInputProps) {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const [localMode, setLocalMode] = useState<AnswerInputMode>('keyboard');
    const mode = controlledMode ?? localMode;
    const setMode = (value: AnswerInputMode) => { setLocalMode(value); onModeChange?.(value); };
    const [desktop, setDesktop] = useState(false);
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const query = window.matchMedia('(pointer: fine)');
        const update = () => setDesktop(query.matches && navigator.maxTouchPoints === 0);
        update(); query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);
    const photoLabel = desktop ? t.handwriting.uploadPhoto : t.handwriting.photo;
    const textarea = useRef<HTMLTextAreaElement>(null);
    const card = variant !== 'default';
    const review = variant === 'review';
    useLayoutEffect(() => {
        if (!card || review || mode !== 'keyboard' || !textarea.current) return;
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
    }, [card, review, mode, value]);
    const dots = (label: string, filled: boolean) => <span className="inline-flex items-center gap-1.5">{label}
        {filled && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}</span>;
    return <div className={review ? "review-answer-input" : "flex flex-1 flex-col gap-3"}>
        {review && <h3 className="font-title text-lg font-semibold">{t.student.myAnswer}</h3>}
        <div className="answer-input-heading flex flex-wrap items-center justify-between gap-2">
            {card ? <SegmentedControl size="compact" aria-label={t.handwriting.inputMode} value={mode} onChange={setMode}
                options={[
                    { value: 'keyboard', label: dots(t.review.typing, !!value.trim()), id: `${id}-typing-tab`, panelId: `${id}-typing-panel` },
                    { value: 'handwriting', label: dots(t.handwriting.handwriting, !!history.strokes.length), id: `${id}-ink-tab`, panelId: `${id}-ink-panel` },
                    { value: 'photo', label: dots(photoLabel, !!photos.length), id: `${id}-photo-tab`, panelId: `${id}-photo-panel` },
                ]} /> : <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.handwriting.inputMode}>
                <Button type="button" className="min-h-11" variant={mode === 'keyboard' ? 'secondary' : 'outline'} aria-pressed={mode === 'keyboard'} onClick={() => setMode('keyboard')}>{t.handwriting.keyboard}{value.trim() ? ' •' : ''}</Button>
                <Button type="button" className="min-h-11" variant={mode === 'handwriting' ? 'secondary' : 'outline'} aria-pressed={mode === 'handwriting'} onClick={() => setMode('handwriting')}>{t.handwriting.handwriting}{history.strokes.length ? ' •' : ''}</Button>
                <Button type="button" className="min-h-11" variant={mode === 'photo' ? 'secondary' : 'outline'} aria-pressed={mode === 'photo'} onClick={() => setMode('photo')}>{dots(photoLabel, !!photos.length)}</Button>
            </div>}
            {topAction && <div className="answer-submit-top ml-auto hidden md:block">{topAction}</div>}
        </div>
        {!card && !compact && <p className="text-xs text-muted-foreground">{t.handwriting.combinedHint}</p>}
        <div id={card ? `${id}-typing-panel` : undefined} role={card ? 'tabpanel' : undefined} aria-labelledby={card ? `${id}-typing-tab` : undefined} hidden={mode !== 'keyboard'} className={review ? 'review-typing-panel' : compact && mode === 'keyboard' ? 'flex min-h-0 flex-1 flex-col' : undefined}>
            <label className={compact || card ? "sr-only" : "mb-2 block font-medium"} htmlFor={id}>{review ? t.student.myAnswer : t.app.yourAnswer}</label>
            <Textarea ref={textarea} id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={5000} disabled={readOnly}
                rows={card ? 3 : 4} placeholder={card ? t.review.answerPlaceholder : undefined}
                aria-invalid={validationError ? true : undefined} aria-describedby={validationError ? `${id}-error` : undefined}
                className={review ? 'review-answer-textarea field-sizing-fixed resize-none text-base leading-7 md:text-base' : card ? 'field-sizing-fixed resize-none overflow-y-auto text-base leading-6 md:text-base' : compact ? 'min-h-40 flex-1 field-sizing-fixed' : undefined} />
        </div>
        <div id={card ? `${id}-ink-panel` : undefined} role={card ? 'tabpanel' : undefined} aria-labelledby={card ? `${id}-ink-tab` : undefined} className={mode === 'handwriting' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <InkWorkspace expanded={expanded && !submitted} onCollapse={() => setExpanded(false)} question={question} submit={topAction} error={validationError || error}>
                <HandwritingCanvas onExpand={() => setExpanded(value => !value)} expanded={expanded && !submitted} onPhoto={() => { setExpanded(false); setMode('photo'); }} history={history} onChange={onInkChange} onPenActivity={onPenActivity} readOnly={readOnly} compact={compact || card} review={review} defaultBackground={review ? 'lines' : 'blank'} />
            </InkWorkspace>
        </div>
        <div id={card ? `${id}-photo-panel` : undefined} role={card ? 'tabpanel' : undefined} aria-labelledby={card ? `${id}-photo-tab` : undefined} hidden={mode !== 'photo'} className="min-w-0 overflow-y-auto">
            <PhotoAnswer photos={photos} onChange={onPhotosChange} onBusyChange={onPhotoBusyChange} readOnly={readOnly} />
        </div>
        {validationError && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{validationError}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>;
}
