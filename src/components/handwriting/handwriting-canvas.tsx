"use client";

import { useState } from 'react';
import { InkToolbar } from './ink-toolbar';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePencilPreference } from '@/lib/hooks/use-pencil-preference';
import { useInkViewport } from '@/lib/hooks/use-ink-viewport';
import { useInkCanvas } from '@/lib/hooks/use-ink-canvas';
import { changeStrokes, redoInk, undoInk } from '@/lib/handwriting/strokes';
import type { InkHistory, PaperBackground } from '@/lib/handwriting/strokes';

interface HandwritingCanvasProps {
    history: InkHistory;
    onPenActivity?: (down: boolean) => void;
    onChange: (history: InkHistory) => void;
    readOnly?: boolean;
    compact?: boolean;
    review?: boolean;
    defaultBackground?: PaperBackground;
}
/** 固定逻辑宽度、自适应纸张高度，屏幕尺寸和 DPR 变化仅调整投影，不修改原始点。 */
export function HandwritingCanvas({ history, onChange, onPenActivity, readOnly = false, compact = false, review = false, defaultBackground = 'blank' }: HandwritingCanvasProps) {
    const { t } = useLanguage();
    const viewport = useInkViewport();
    const { pencilOnly, setPencilOnly, onPen } = usePencilPreference();
    const [eraser, setEraser] = useState(false);
    const [color, setColor] = useState('#111827');
    const [size, setSize] = useState(4);
    const [background, setBackground] = useState<PaperBackground>(defaultBackground);
    const { canvas, ...events } = useInkCanvas({ history, onChange, onPenActivity, readOnly, pencilOnly, eraser, color, size, background,
        onPen });
    const toolbar = <div className={review ? "review-ink-tools" : "mb-2"}>
        <InkToolbar review={review} compact={compact}
            {...{ pencilOnly, setPencilOnly, eraser, setEraser, color, setColor, size, setSize, background, setBackground, readOnly }}
            undo={() => onChange(undoInk(history))} redo={() => onChange(redoInk(history))}
            clear={() => onChange(changeStrokes(history, []))}
            canUndo={history.past.length > 0} canRedo={history.future.length > 0} hasInk={history.strokes.length > 0} />
    </div>;
    return <div className={review ? "review-ink flex min-h-0 flex-1 flex-col" : compact ? "relative flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1 flex-col"}>
        {toolbar}
        {!compact && <p className="py-2 text-xs text-muted-foreground">{readOnly ? t.handwriting.readOnly : pencilOnly ? t.handwriting.scrollHint : t.handwriting.drawHint}</p>}
        <div ref={viewport} className={review ? "review-ink-paper relative min-h-[160px] flex-1 overflow-hidden rounded-md border" : compact ? "relative min-h-[220px] flex-1 overflow-hidden rounded-md border lg:landscape:h-[var(--ink-height,48dvh)] lg:landscape:min-h-[240px] lg:landscape:flex-none" : "relative min-h-[320px] flex-1 overflow-hidden rounded-md border h-[55dvh] lg:h-[var(--ink-height,55dvh)] lg:min-h-[240px] lg:flex-none"}>
            <canvas ref={canvas} {...events} aria-label={t.handwriting.canvas} aria-disabled={readOnly}
                className="absolute inset-0 h-full w-full"
                style={{ touchAction: readOnly || pencilOnly ? 'pan-x pan-y pinch-zoom' : 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                onContextMenu={event => event.preventDefault()} onDoubleClick={event => event.preventDefault()} />
        </div>
    </div>;
}
