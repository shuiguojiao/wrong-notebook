import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderContinuationPage, renderQuestionImage, stackQuestionImages } from '@/lib/import/batch-crop';
import { computeOutputSize, DEFAULT_IMAGE_LIMITS, renderRegion } from '@/lib/image-pipeline';

vi.mock('@/lib/image-pipeline', async original => ({
    ...await original<typeof import('@/lib/image-pipeline')>(),
    renderRegion: vi.fn(async () => ({ dataUrl: 'data:image/jpeg;base64,AA==', width: 2400, height: 6816, bytes: 1 })),
}));

afterEach(() => vi.unstubAllGlobals());

describe('跨页拼接保留文字分辨率', () => {
    it.each(['parts', 'regions', 'continuation'])('%s 入口使用长图尺寸与体积上限', async entry => {
        const close = vi.fn();
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close })));
        vi.stubGlobal('Image', class {
            naturalWidth = 2400;
            naturalHeight = 3400;
            decode = async () => {};
        });
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
        const page = { naturalWidth: 2400, naturalHeight: 3400 } as HTMLImageElement;
        const region = { x: 0, y: 0, width: 1, height: 1 };
        if (entry === 'parts') await stackQuestionImages(['data:image/jpeg;base64,AA==', 'data:image/jpeg;base64,AA==']);
        if (entry === 'regions') await renderQuestionImage(page, [region, region]);
        if (entry === 'continuation') await renderContinuationPage(page, [region], { source: page, width: 2400, height: 3400 });
        const limits = vi.mocked(renderRegion).mock.calls[0][2];
        expect(limits).toMatchObject({ maxLongEdge: 8192, maxPixels: 24 * 1024 * 1024, maxBytes: 4 * 1024 * 1024 });
        const output = computeOutputSize(2400, 6816, limits ?? DEFAULT_IMAGE_LIMITS);
        expect(output.width).toBe(2400);
        expect(output.height).toBe(6816);
        expect(close).toHaveBeenCalledOnce();
    });
});
