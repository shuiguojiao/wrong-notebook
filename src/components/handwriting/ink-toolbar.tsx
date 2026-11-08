"use client";

import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { PaperBackground } from '@/lib/handwriting/strokes';

interface InkToolbarProps {
    eraser: boolean; setEraser: (value: boolean) => void;
    color: string; setColor: (value: string) => void;
    size: number; setSize: (value: number) => void;
    background: PaperBackground; setBackground: (value: PaperBackground) => void;
    pencilOnly: boolean; setPencilOnly: (value: boolean) => void;
    undo: () => void; redo: () => void; clear: () => void;
    canUndo: boolean; canRedo: boolean; hasInk: boolean; readOnly: boolean;
}
export function InkToolbar(props: InkToolbarProps) {
    const { t } = useLanguage();
    const h = t.handwriting;
    return <fieldset disabled={props.readOnly} className="flex flex-wrap items-center gap-2 lg:gap-1 lg:[&_button]:px-2 lg:[&_select]:px-1 rounded-t-md border bg-muted/30 p-2">
        <legend className="sr-only">{h.tools}</legend>
        <Button type="button" className="min-h-11" variant={props.eraser ? 'outline' : 'secondary'} aria-pressed={!props.eraser} onClick={() => props.setEraser(false)}>{h.pen}</Button>
        <Button type="button" className="min-h-11" variant={props.eraser ? 'secondary' : 'outline'} aria-pressed={props.eraser} onClick={() => props.setEraser(true)}>{h.eraser}</Button>
        <select aria-label={h.color} value={props.color} onChange={event => { props.setColor(event.target.value); props.setEraser(false); }} className="h-11 rounded-md border bg-background px-2">
            <option value="#111827">{h.black}</option><option value="#1d4ed8">{h.blue}</option><option value="#b91c1c">{h.red}</option>
        </select>
        <select aria-label={h.width} value={props.size} onChange={event => props.setSize(Number(event.target.value))} className="h-11 rounded-md border bg-background px-2">
            <option value={4}>{h.thin}</option><option value={7}>{h.medium}</option><option value={11}>{h.thick}</option>
        </select>
        <select aria-label={h.background} value={props.background} onChange={event => props.setBackground(event.target.value as PaperBackground)} className="h-11 rounded-md border bg-background px-2">
            <option value="blank">{h.blank}</option><option value="grid">{h.grid}</option><option value="lines">{h.lines}</option>
        </select>
        <Button type="button" className="min-h-11" variant="outline" onClick={props.undo} disabled={!props.canUndo}>{h.undo}</Button>
        <Button type="button" className="min-h-11" variant="outline" onClick={props.redo} disabled={!props.canRedo}>{h.redo}</Button>
        <Button type="button" className="min-h-11" variant="outline" onClick={props.clear} disabled={!props.hasInk}>{h.clear}</Button>
        <label className="flex min-h-11 shrink-0 items-center gap-2 px-1 text-sm">
            <input type="checkbox" checked={props.pencilOnly} onChange={event => props.setPencilOnly(event.target.checked)} />{h.pencilOnly}
        </label>
    </fieldset>;
}
