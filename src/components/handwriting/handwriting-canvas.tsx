"use client";

import { useId, useState } from 'react';
import { InkToolbar } from '@/components/handwriting/ink-toolbar';
import { PaperScrollbar } from '@/components/handwriting/paper-scrollbar';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useInkPaper } from '@/lib/hooks/use-ink-paper';
import { usePencilPreference } from '@/lib/hooks/use-pencil-preference';
import { useInkViewport } from '@/lib/hooks/use-ink-viewport';
import { useInkCanvas } from '@/lib/hooks/use-ink-canvas';
import { changeStrokes, extendPaper, MAX_PAPER_HEIGHT, redoInk, undoInk } from '@/lib/handwriting/strokes';
import type { InkHistory, PaperBackground } from '@/lib/handwriting/strokes';

interface HandwritingCanvasProps {
    onExpand?: () => void;
    onPhoto?: () => void;
    expanded?: boolean;
    history: InkHistory;
    onPenActivity?: (down: boolean) => void;
    onChange: (history: InkHistory) => void;
    readOnly?: boolean;
    compact?: boolean;
    review?: boolean;
    defaultBackground?: PaperBackground;
}
/** 独立纸高和固定侧轨占位，转屏或切换 Pencil 模式仅调整投影，不改写原始点。 */
export function HandwritingCanvas({ history, onChange, onPenActivity, readOnly = false, compact = false, review = false, defaultBackground = 'blank', onExpand, onPhoto, expanded = false }: HandwritingCanvasProps) {
    const { t } = useLanguage();
    const paperId = useId();
    const viewport = useInkViewport();
    const paper = useInkPaper(viewport, history, onChange);
    const { pencilOnly, setPencilOnly, onPen } = usePencilPreference();
    const [eraser, setEraser] = useState(false);
    const [color, setColor] = useState('#111827');
    const [size, setSize] = useState(4);
    const [background, setBackground] = useState<PaperBackground>(defaultBackground);
    const { canvas, surface, ...events } = useInkCanvas({ history, onChange, onPenActivity, readOnly, pencilOnly, eraser, color, size, background,
        onPen });
    const full = (paper.height ?? 0) >= MAX_PAPER_HEIGHT;
    const paperCss = paper.height && paper.width ? paper.height * paper.width / 1000 : undefined;
    const toolbar = <div className={review ? "review-ink-tools" : "mb-2"}>
        <InkToolbar review={review} compact={compact} onExpand={onExpand} expanded={expanded}
            {...{ pencilOnly, setPencilOnly, eraser, setEraser, color, setColor, size, setSize, background, setBackground, readOnly }}
            undo={() => onChange(undoInk(history))} redo={() => onChange(redoInk(history))}
            clear={() => onChange(changeStrokes(history, []))}
            canUndo={history.past.length > 0} canRedo={history.future.length > 0} hasInk={history.strokes.length > 0} />
    </div>;
    return <div className={review ? "review-ink flex min-h-0 flex-1 flex-col" : compact ? "relative flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1 flex-col"}>
        {toolbar}
        {!compact && <p className="py-2 text-xs text-muted-foreground">{readOnly ? t.handwriting.readOnly : pencilOnly ? t.handwriting.scrollHint : t.handwriting.drawHint}</p>}
        <div className={`ink-paper-frame flex min-h-0 ${review ? 'min-h-[160px] flex-1' : compact ? 'min-h-[220px] flex-1 lg:landscape:h-[var(--ink-height,48dvh)] lg:landscape:min-h-[240px] lg:landscape:flex-none' : 'min-h-[320px] h-[55dvh] lg:h-[var(--ink-height,55dvh)] lg:min-h-[240px] lg:flex-none'}`}>
            <div ref={viewport} id={paperId} data-ink-scroll className={`${review ? 'review-ink-paper ' : ''}relative min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-md border`}>
                {/* 外层按纸高撑开供滚动；画布只有可视区域大小并吸顶，滚动时平移绘制，避免长纸占用巨量画布内存。 */}
                <div ref={surface} className="relative" style={{ height: paperCss ?? '100%' }}>
                    <canvas ref={canvas} {...events} aria-label={t.handwriting.canvas} aria-disabled={readOnly}
                        className="sticky top-0 block w-full" data-paper-height={paper.height} data-stroke-count={history.strokes.length}
                        style={{ height: paperCss && paper.viewHeight ? Math.min(paperCss, paper.viewHeight) : '100%', touchAction: readOnly || pencilOnly ? 'pan-x pan-y pinch-zoom' : 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                        onContextMenu={event => event.preventDefault()} onDoubleClick={event => event.preventDefault()} />
                </div>
                <Button type="button" variant="outline" className="min-h-11 w-full whitespace-normal" disabled={readOnly}
                    onClick={() => full ? onPhoto?.() : onChange({ ...history, paperHeight: extendPaper(paper.height ?? 750) })}>
                    {full ? t.handwriting.paperFull : t.handwriting.morePaper}
                </Button>
            </div>
            <div className="flex w-6 shrink-0">{!pencilOnly && <PaperScrollbar controls={paperId} viewport={viewport} height={paper.height} />}</div>
        </div>
    </div>;
}
