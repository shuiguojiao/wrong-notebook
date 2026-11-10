import { MAX_ANSWER_IMAGE_BYTES } from './image';

const DISPLAY_WIDTH = 1000;
const SEPARATOR_HEIGHT = 24;
const JPEG_QUALITIES = [0.85, 0.75, 0.65, 0.55];

function loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => image.naturalWidth && image.naturalHeight
            ? resolve(image) : reject(new Error('IMAGE_EXPORT_FAILED'));
        image.onerror = () => reject(new Error('IMAGE_EXPORT_FAILED'));
        image.src = source;
    });
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('IMAGE_EXPORT_FAILED')), 'image/jpeg', quality);
    });
}

function toDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('IMAGE_EXPORT_FAILED'));
        reader.readAsDataURL(blob);
    });
}

/** 原图用于判题，白底竖向拼图仅用于对照和记录展示。 */
export async function composeAnswerImages(images: string[]): Promise<string> {
    if (!images.length) throw new Error('IMAGE_EXPORT_FAILED');
    if (images.length === 1) return images[0];
    const loaded = await Promise.all(images.map(loadImage));
    const heights = loaded.map(image => Math.round(image.naturalHeight * DISPLAY_WIDTH / image.naturalWidth));
    const totalHeight = heights.reduce((sum, height) => sum + height, 0) + SEPARATOR_HEIGHT * (images.length - 1);
    const canvas = document.createElement('canvas');
    let width = DISPLAY_WIDTH;
    while (width >= 1) {
        const scale = width / DISPLAY_WIDTH;
        canvas.width = width;
        canvas.height = Math.max(1, Math.round(totalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('IMAGE_EXPORT_FAILED');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.scale(scale, scale);
        let top = 0;
        loaded.forEach((image, index) => {
            if (index > 0) {
                context.fillStyle = '#f1f5f9';
                context.fillRect(0, top, DISPLAY_WIDTH, SEPARATOR_HEIGHT);
                top += SEPARATOR_HEIGHT;
            }
            context.drawImage(image, 0, top, DISPLAY_WIDTH, heights[index]);
            top += heights[index];
        });
        let size = 0;
        for (const quality of JPEG_QUALITIES) {
            const blob = await encode(canvas, quality);
            if (blob.size <= MAX_ANSWER_IMAGE_BYTES) return toDataUrl(blob);
            size = blob.size;
        }
        // 根据最后一次编码的大小估算缩放比例，至少缩小一成以保证收敛。
        width = Math.floor(width * Math.min(0.9, Math.sqrt(MAX_ANSWER_IMAGE_BYTES / size) * 0.9));
    }
    throw new Error('IMAGE_EXPORT_TOO_LARGE');
}
