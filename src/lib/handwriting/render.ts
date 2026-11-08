import { MAX_ANSWER_IMAGE_BYTES } from './image';
import { exportDimensions, inkBounds, PAGE_HEIGHT, PAGE_WIDTH, strokeOutline } from './strokes';
import type { InkStroke, PaperBackground } from './strokes';

export function drawStrokes(context: CanvasRenderingContext2D, strokes: InkStroke[]) {
    for (const stroke of strokes) {
        const outline = strokeOutline(stroke);
        if (!outline.length) continue;
        context.beginPath();
        context.moveTo(outline[0][0], outline[0][1]);
        for (const [x, y] of outline.slice(1)) context.lineTo(x, y);
        context.closePath();
        context.fillStyle = stroke.color;
        context.fill();
    }
}
export function drawPaper(context: CanvasRenderingContext2D, background: PaperBackground) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    if (background === 'blank') return;
    context.strokeStyle = '#dbe3ed';
    context.lineWidth = 1;
    context.beginPath();
    for (let y = 40; y < PAGE_HEIGHT; y += 40) { context.moveTo(0, y); context.lineTo(PAGE_WIDTH, y); }
    if (background === 'grid') for (let x = 40; x < PAGE_WIDTH; x += 40) { context.moveTo(x, 0); context.lineTo(x, PAGE_HEIGHT); }
    context.stroke();
}
const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('IMAGE_EXPORT_FAILED')), type, quality);
});
const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('IMAGE_EXPORT_FAILED'));
    reader.readAsDataURL(blob);
});

/** 白底裁剪，只导出笔迹；优先较小的 PNG/JPEG，超限时降低分辨率与 JPEG 质量。 */
export async function exportInk(strokes: InkStroke[]): Promise<string | undefined> {
    const bounds = inkBounds(strokes);
    if (!bounds) return undefined;
    for (const [maxEdge, quality] of [[1600, 0.9], [1200, 0.8], [900, 0.7], [600, 0.6]]) {
        const canvas = document.createElement('canvas');
        const { width, height, scale } = exportDimensions(bounds, maxEdge);
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('IMAGE_EXPORT_FAILED');
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
        context.scale(scale, scale); context.translate(-bounds.x, -bounds.y);
        drawStrokes(context, strokes);
        const blobs = await Promise.all([toBlob(canvas, 'image/png'), toBlob(canvas, 'image/jpeg', quality)]);
        const smallest = blobs[0].size <= blobs[1].size ? blobs[0] : blobs[1];
        if (smallest.size <= MAX_ANSWER_IMAGE_BYTES) return dataUrl(smallest);
    }
    throw new Error('IMAGE_EXPORT_TOO_LARGE');
}
