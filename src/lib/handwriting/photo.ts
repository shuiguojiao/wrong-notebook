import { MAX_ANSWER_IMAGE_BYTES } from '@/lib/handwriting/image';
import { processImageBlob } from '@/lib/image-pipeline';

export const MAX_ANSWER_PHOTOS = 3;

/** 复用图片管线，在裁剪和旋转后统一限制答案照片的尺寸与体积。 */
export async function compressAnswerPhoto(blob: Blob): Promise<string> {
    const { rendered } = await processImageBlob(blob, {
        maxLongEdge: 2000,
        maxPixels: 2000 * 2000,
        maxBytes: MAX_ANSWER_IMAGE_BYTES,
        startQuality: 0.85,
        minQuality: 0.55,
    });
    if (rendered.bytes > MAX_ANSWER_IMAGE_BYTES) throw new Error('IMAGE_EXPORT_TOO_LARGE');
    return rendered.dataUrl;
}

export async function rotateAnswerPhoto(source: string): Promise<string> {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject(new Error('IMAGE_EMPTY'));
        image.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
        image.src = source;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalHeight;
    canvas.height = image.naturalWidth;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('CANVAS_UNSUPPORTED');
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(value => value ? resolve(value) : reject(new Error('CANVAS_EMPTY')), 'image/png');
    });
    return compressAnswerPhoto(blob);
}
