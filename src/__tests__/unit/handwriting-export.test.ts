import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportInk } from '@/lib/handwriting/render';
import { MAX_ANSWER_IMAGE_BYTES } from '@/lib/handwriting/image';
import type { InkStroke } from '@/lib/handwriting/strokes';

const strokes: InkStroke[] = [{ points: [[100, 100, 0.4], [400, 300, 1]], color: '#111827', size: 7, pen: true }];
const context = { fillRect: vi.fn(), scale: vi.fn(), translate: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillStyle: '' };
beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});

describe('手写图片导出', () => {
    it('空白不产生可提交的图片', async () => { expect(await exportInk([])).toBeUndefined(); });
    it('裁剪后绘制白底，同时比较两种编码并选较小 JPEG', async () => {
        const dimensions: number[][] = [];
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, type) {
            dimensions.push([this.width, this.height]);
            callback(new Blob([type === 'image/png' ? 'long png content' : 'jpeg'], { type }));
        });
        expect(await exportInk(strokes)).toMatch(/^data:image\/jpeg;base64,/);
        expect(context.fillStyle).toBe('#111827');
        expect(context.fillRect).toHaveBeenCalledWith(0, 0, expect.any(Number), expect.any(Number));
        expect(context.translate).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
        expect(dimensions[0][0]).toBeLessThan(400);
        expect(dimensions[0][1]).toBeLessThan(300);
    });
    it('PNG 更小时保留无损图片', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob([type === 'image/png' ? 'png' : 'long jpeg content'], { type })));
        expect(await exportInk(strokes)).toMatch(/^data:image\/png;base64,/);
    });
    it('超限时降低尺寸与质量；仍超限则失败而非返回超大图片', async () => {
        const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob([new Uint8Array(MAX_ANSWER_IMAGE_BYTES + 1)], { type })));
        await expect(exportInk(strokes)).rejects.toThrow('IMAGE_EXPORT_TOO_LARGE');
        expect(encode).toHaveBeenCalledTimes(8);
        expect(encode.mock.calls.filter(call => call[1] === 'image/jpeg').map(call => call[2])).toEqual([0.9, 0.8, 0.7, 0.6]);
    });
    it('编码失败向上传递，交由作答区保留草稿并显示错误', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(null));
        await expect(exportInk(strokes)).rejects.toThrow('IMAGE_EXPORT_FAILED');
    });
});
