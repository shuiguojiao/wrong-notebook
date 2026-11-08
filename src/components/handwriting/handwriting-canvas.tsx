"use client";

import { useState } from 'react';
import { InkToolbar } from './ink-toolbar';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePencilPreference } from '@/lib/hooks/use-pencil-preference';
import { useInkCanvas } from '@/lib/hooks/use-ink-canvas';
import { changeStrokes, redoInk, undoInk } from '@/lib/handwriting/strokes';
import type { InkHistory, PaperBackground } from '@/lib/handwriting/strokes';

interface HandwritingCanvasProps {
    history: InkHistory;
    onChange: (history: InkHistory) => void;
    readOnly?: boolean;
}
/** 固定逻辑纸张，屏幕尺寸和 DPR 变化仅调整投影，不修改原始点。 */
export function HandwritingCanvas({ history, onChange, readOnly = false }: HandwritingCanvasProps) {
    const { t } = useLanguage();
    const { pencilOnly, setPencilOnly, onPen } = usePencilPreference();
    const [eraser, setEraser] = useState(false);
    const [color, setColor] = useState('#111827');
    const [size, setSize] = useState(4);
    const [background, setBackground] = useState<PaperBackground>('blank');
    const { canvas, ...events } = useInkCanvas({ history, onChange, readOnly, pencilOnly, eraser, color, size, background,
        onPen });
    return <div className="flex min-h-0 flex-1 flex-col">
        <InkToolbar {...{ pencilOnly, setPencilOnly, eraser, setEraser, color, setColor, size, setSize, background, setBackground, readOnly }}
            undo={() => onChange(undoInk(history))} redo={() => onChange(redoInk(history))} clear={() => onChange(changeStrokes(history, []))}
            canUndo={history.past.length > 0} canRedo={history.future.length > 0} hasInk={history.strokes.length > 0} />
        <p className="py-2 text-xs text-muted-foreground">{readOnly ? t.handwriting.readOnly : pencilOnly ? t.handwriting.scrollHint : t.handwriting.drawHint}</p>
        <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-md border h-[55dvh] lg:min-h-[420px]">
            <canvas ref={canvas} {...events} aria-label={t.handwriting.canvas} aria-disabled={readOnly}
                className="absolute inset-0 h-full w-full"
                style={{ touchAction: readOnly || pencilOnly ? 'pan-x pan-y pinch-zoom' : 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                onContextMenu={event => event.preventDefault()} onDoubleClick={event => event.preventDefault()} />
        </div>
    </div>;
}
