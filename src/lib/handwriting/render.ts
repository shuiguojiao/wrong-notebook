import { MAX_ANSWER_IMAGE_BYTES } from './image';
import { exportDimensions, inkBounds, PAGE_WIDTH, strokeOutline } from './strokes';
import type { InkBounds, InkStroke, PaperBackground } from './strokes';

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
export function drawPaper(context: CanvasRenderingContext2D, background: PaperBackground, height: number) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, PAGE_WIDTH, height);
    if (background === 'blank') return;
    context.strokeStyle = '#dbe3ed';
    context.lineWidth = 1;
    context.beginPath();
    for (let y = 40; y < height; y += 40) { context.moveTo(0, y); context.lineTo(PAGE_WIDTH, y); }
    if (background === 'grid') for (let x = 40; x < PAGE_WIDTH; x += 40) { context.moveTo(x, 0); context.lineTo(x, height); }
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

export const INK_SEGMENT_HEIGHT = 1300;

/** 短答案仍裁剪外框；长答案按纸面分段，交界处的整笔由画布边界裁切。 */
export function inkSegments(strokes: InkStroke[]): InkBounds[] {
    const bounds = inkBounds(strokes);
    if (!bounds) return [];
    if (inkBounds(strokes, 0)!.height <= INK_SEGMENT_HEIGHT) return [bounds];
    const segments: InkBounds[] = [];
    const end = bounds.y + bounds.height;
    for (let y = Math.max(0, Math.floor(bounds.y / INK_SEGMENT_HEIGHT) * INK_SEGMENT_HEIGHT); y < end; y += INK_SEGMENT_HEIGHT) {
        const height = Math.min(INK_SEGMENT_HEIGHT, end - y);
        if (strokes.some(stroke => {
            const box = inkBounds([stroke], 0);
            return box && box.y < y + height && box.y + box.height >= y;
        })) segments.push({ x: 0, y, width: PAGE_WIDTH, height });
    }
    return segments;
}

async function exportSegment(strokes: InkStroke[], bounds: InkBounds, segmented: boolean): Promise<string> {
    for (const [maxEdge, quality] of [[1600, 0.9], [1200, 0.8], [900, 0.7], [600, 0.6]]) {
        const canvas = document.createElement('canvas');
        // 长纸只降低编码质量，始终保留至少 1000px 的纸面宽度。
        const { width, height, scale } = exportDimensions(bounds, segmented ? 1600 : maxEdge);
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

/** 白底导出，不包含纸张纹理，空段不占用提交图片数量。 */
export async function exportInk(strokes: InkStroke[]): Promise<string[]> {
    const bounds = inkBounds(strokes, 0);
    const segmented = !!bounds && bounds.height > INK_SEGMENT_HEIGHT;
    const images: string[] = [];
    for (const segment of inkSegments(strokes)) images.push(await exportSegment(strokes, segment, segmented));
    return images;
}
