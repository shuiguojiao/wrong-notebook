import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compressAnswerPhoto, rotateAnswerPhoto } from '@/lib/handwriting/photo';
import { MAX_ANSWER_IMAGE_BYTES } from '@/lib/handwriting/image';

const mocks = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock('@/lib/image-pipeline', () => ({ processImageBlob: mocks.process }));
const context = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() };
beforeEach(() => {
    vi.clearAllMocks();
    mocks.process.mockResolvedValue({ rendered: { dataUrl: 'compressed', bytes: 100 } });
});
describe('答案照片处理', () => {
    it('复用压缩管线，限定长边 2000、1.5MB、JPEG 从 0.85 降质', async () => {
        const blob = new Blob(['cropped']);
        expect(await compressAnswerPhoto(blob)).toBe('compressed');
        expect(mocks.process).toHaveBeenCalledWith(blob, { maxLongEdge: 2000, maxPixels: 4000000, maxBytes: MAX_ANSWER_IMAGE_BYTES, startQuality: 0.85, minQuality: 0.55 });
    });
    it('压缩管线达到重试上限仍超限时拒绝加入答案', async () => {
        mocks.process.mockResolvedValue({ rendered: { bytes: MAX_ANSWER_IMAGE_BYTES + 1 } });
        await expect(compressAnswerPhoto(new Blob())).rejects.toThrow('IMAGE_EXPORT_TOO_LARGE');
    });
    it('canvas 顺时针旋转 90 度，宽高交换，再复用压缩', async () => {
        vi.stubGlobal('Image', class {
            naturalWidth = 1200; naturalHeight = 800;
            onload?: () => void;
            set src(_value: string) { this.onload?.(); }
        });
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
        let dimensions: number[] = [];
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
            dimensions = [this.width, this.height]; callback(new Blob(['rotated'], { type: 'image/png' }));
        });
        try {
            expect(await rotateAnswerPhoto('source')).toBe('compressed');
            expect(dimensions).toEqual([800, 1200]);
            expect(context.translate).toHaveBeenCalledWith(800, 0);
            expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
            expect(context.drawImage).toHaveBeenCalledWith(expect.any(Object), 0, 0);
        } finally { vi.unstubAllGlobals(); }
    });
});
