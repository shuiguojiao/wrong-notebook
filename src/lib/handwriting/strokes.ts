import { getStroke } from 'perfect-freehand';

export type InkPoint = [number, number, number];
export interface InkStroke { points: InkPoint[]; size: number; color: string; pen: boolean }
export interface InkHistory { strokes: InkStroke[]; past: InkStroke[][]; future: InkStroke[][]; paperHeight?: number }
export type PaperBackground = 'blank' | 'grid' | 'lines';
export const PAGE_WIDTH = 1000;
export const MAX_PAPER_HEIGHT = 3000;
export const PAPER_INCREMENT = 750;

export function extendPaper(height: number): number {
    return Math.min(MAX_PAPER_HEIGHT, height + PAPER_INCREMENT);
}
export function autoExtendPaper(height: number, y: number): number {
    return y >= height - 120 ? extendPaper(height) : height;
}
/** 限制整张画布的像素数，避免 iPad Safari 超出画布内存上限。 */
export function canvasPixelRatio(width: number, height: number, dpr: number): number {
    return Math.min(dpr, Math.sqrt(16_000_000 / (Math.ceil(width) * Math.ceil(height))));
}

export const emptyHistory = (): InkHistory => ({ strokes: [], past: [], future: [] });

/** 过滤无效点及几乎重合的采样，压感变化仍然保留。 */
export function appendPoint(points: InkPoint[], point: InkPoint): InkPoint[] {
    if (!point.every(Number.isFinite)) return points;
    const next: InkPoint = [point[0], point[1], Math.min(1, Math.max(0.05, point[2]))];
    const previous = points.at(-1);
    if (previous && Math.hypot(next[0] - previous[0], next[1] - previous[1]) < 0.6 && Math.abs(next[2] - previous[2]) < 0.03) return points;
    return [...points, next];
}

export function changeStrokes(history: InkHistory, strokes: InkStroke[]): InkHistory {
    if (strokes === history.strokes) return history;
    return { ...history, strokes, past: [...history.past.slice(-49), history.strokes], future: [] };
}
export function undoInk(history: InkHistory): InkHistory {
    const strokes = history.past.at(-1);
    return strokes ? { ...history, strokes, past: history.past.slice(0, -1), future: [history.strokes, ...history.future] } : history;
}
export function redoInk(history: InkHistory): InkHistory {
    const strokes = history.future[0];
    return strokes ? { ...history, strokes, past: [...history.past, history.strokes], future: history.future.slice(1) } : history;
}

/** 仅在采集新笔点时提高轻写下限，保留旧点的存储值。 */
export function penPressure(pressure: number): number {
    return 0.35 + 0.65 * Math.max(0, Math.min(1, pressure));
}

export function strokeOutline(stroke: InkStroke): number[][] {
    return getStroke(stroke.points, { size: stroke.size, thinning: stroke.pen ? 0.45 : 0.6, smoothing: 0.5, streamline: 0.4, simulatePressure: !stroke.pen, last: true });
}
export interface InkBounds { x: number; y: number; width: number; height: number }
export function inkBounds(strokes: InkStroke[], padding = 20): InkBounds | null {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const stroke of strokes) for (const [x, y] of strokeOutline(stroke)) {
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return Number.isFinite(left) ? { x: left - padding, y: top - padding, width: right - left + padding * 2, height: bottom - top + padding * 2 } : null;
}
export function exportDimensions(bounds: InkBounds, maxEdge = 1600) {
    const scale = Math.min(1, maxEdge / Math.max(bounds.width, bounds.height));
    return { width: Math.max(1, Math.floor(bounds.width * scale)), height: Math.max(1, Math.floor(bounds.height * scale)), scale };
}

function distanceToSegment(point: InkPoint, start: InkPoint, end: InkPoint): number {
    const dx = end[0] - start[0], dy = end[1] - start[1];
    const t = dx || dy ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy);
}
/** 按整笔擦除；检测线段而不是只检测采样点，快速书写的稀疏点也能擦除。 */
export function eraseAt(strokes: InkStroke[], point: InkPoint): InkStroke[] {
    const remaining = strokes.filter(stroke => !stroke.points.some((p, i) => distanceToSegment(point, p, stroke.points[i + 1] ?? p) <= 12 + stroke.size));
    return remaining.length === strokes.length ? strokes : remaining;
}

/** 固定逻辑宽度，纸张高度完整覆盖视区；不限制长纸，避免极端比例产生死区。 */
export function paperSize(width: number, height: number) {
    const safeWidth = Number.isFinite(width) && width > 0 ? width : PAGE_WIDTH;
    const safeHeight = Number.isFinite(height) && height > 0 ? height : safeWidth;
    return { width: PAGE_WIDTH, height: PAGE_WIDTH * (safeHeight / safeWidth) };
}

/** 左上角锚定、仅按宽度等比投影，旋转不改写笔迹坐标。 */
export function pageTransform(width: number, height: number) {
    const paper = paperSize(width, height);
    const scale = Number.isFinite(width) && width > 0 ? width / PAGE_WIDTH : 1;
    return { scale, x: 0, y: 0, paper };
}
export function acceptsPointer(pointerType: string, pencilOnly: boolean, activeType?: string): boolean {
    return !(pointerType === 'touch' && (pencilOnly || activeType === 'pen'));
}
