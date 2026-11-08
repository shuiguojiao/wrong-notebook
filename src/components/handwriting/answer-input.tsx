"use client";

import { useState } from 'react';
import { HandwritingCanvas } from './handwriting-canvas';
import { Button } from '@/components/ui/button';
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
}
export function AnswerInput({ id, value, onChange, history, onInkChange, readOnly, error }: AnswerInputProps) {
    const { t } = useLanguage();
    const [mode, setMode] = useState<'keyboard' | 'handwriting'>('keyboard');
    return <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.handwriting.inputMode}>
            <Button type="button" className="min-h-11" variant={mode === 'keyboard' ? 'secondary' : 'outline'} aria-pressed={mode === 'keyboard'} onClick={() => setMode('keyboard')}>{t.handwriting.keyboard}{value.trim() ? ' •' : ''}</Button>
            <Button type="button" className="min-h-11" variant={mode === 'handwriting' ? 'secondary' : 'outline'} aria-pressed={mode === 'handwriting'} onClick={() => setMode('handwriting')}>{t.handwriting.handwriting}{history.strokes.length ? ' •' : ''}</Button>
        </div>
        <p className="text-xs text-muted-foreground">{t.handwriting.combinedHint}</p>
        <div hidden={mode !== 'keyboard'}>
            <label className="mb-2 block font-medium" htmlFor={id}>{t.app.yourAnswer}</label>
            <Textarea id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={5000} disabled={readOnly} rows={4} />
        </div>
        <div className={mode === 'handwriting' ? 'flex flex-1 flex-col' : 'hidden'}>
            <HandwritingCanvas history={history} onChange={onInkChange} readOnly={readOnly} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>;
}
