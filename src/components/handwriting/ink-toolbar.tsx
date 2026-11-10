"use client";

import { Eraser, Pencil, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { PaperBackground } from '@/lib/handwriting/strokes';

interface InkToolbarProps {
    onExpand?: () => void;
    expanded?: boolean;
    compact?: boolean;
    review?: boolean;
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
    const expand = props.onExpand && <Button type="button" variant="outline" hidden={props.expanded} className="min-h-11" onClick={props.onExpand}>{h.expand}</Button>;
    if (props.compact) return <div className={`flex flex-wrap gap-2 rounded-md bg-background/95 p-1 shadow-sm ${props.review ? 'justify-start' : 'justify-end'}`}>
        <Button type="button" aria-label={h.pen} title={h.pen} className="h-11 w-11" variant={props.eraser ? 'outline' : 'secondary'} disabled={props.readOnly}
            aria-pressed={!props.eraser} onClick={() => props.setEraser(false)}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>
        <Button type="button" aria-label={h.eraser} title={h.eraser} className="h-11 w-11" variant={props.eraser ? 'secondary' : 'outline'} disabled={props.readOnly}
            aria-pressed={props.eraser} onClick={() => props.setEraser(true)}><Eraser className="h-4 w-4" aria-hidden="true" /></Button>
        <Button type="button" aria-label={h.undo} title={h.undo} className="h-11 w-11" variant="outline" disabled={props.readOnly || !props.canUndo}
            onClick={props.undo}><Undo2 className="h-4 w-4" aria-hidden="true" /></Button>
        {expand}
        <details className="relative">
            <summary className="flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm">{h.tools}</summary>
            <div className={props.review ? "mt-2 w-[min(19rem,calc(100vw-4rem))] rounded-md bg-background shadow-lg" : "absolute right-0 top-full z-20 mt-2 w-[min(19rem,calc(100vw-4rem))] rounded-md bg-background shadow-lg"}>
                <InkToolbar {...props} compact={false} onExpand={undefined} />
            </div>
        </details>
    </div>;
    return <fieldset disabled={props.readOnly} className="flex flex-wrap items-center gap-2 lg:gap-1 lg:[&_button]:px-2 lg:[&_select]:px-1 rounded-t-md border bg-muted/30 p-2">
        <legend className="sr-only">{h.tools}</legend>
        {expand}
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
