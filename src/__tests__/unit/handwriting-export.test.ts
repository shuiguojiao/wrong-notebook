import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drawPaper, exportInk, inkSegments } from '@/lib/handwriting/render';
import { MAX_ANSWER_IMAGE_BYTES } from '@/lib/handwriting/image';
import type { InkStroke } from '@/lib/handwriting/strokes';

const strokes: InkStroke[] = [{ points: [[100, 100, 0.4], [400, 300, 1]], color: '#111827', size: 7, pen: true }];
const context = { fillRect: vi.fn(), scale: vi.fn(), translate: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillStyle: '' };
beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});

describe('手写图片导出', () => {
    it.each(['grid', 'lines'] as const)('背景 %s 铺满长纸和短纸', background => {
        const paper = { ...context, stroke: vi.fn() };
        for (const height of [300, 2000]) {
            vi.clearAllMocks();
            drawPaper(paper as unknown as CanvasRenderingContext2D, background, height);
            expect(paper.fillRect).toHaveBeenCalledWith(0, 0, 1000, height);
            expect(paper.lineTo).toHaveBeenCalledWith(1000, Math.floor((height - 1) / 40) * 40);
            if (background === 'grid') expect(paper.lineTo).toHaveBeenCalledWith(40, height);
        }
    });
    it('空白不产生可提交的图片', async () => { expect(await exportInk([])).toEqual([]); });
    it('裁剪后绘制白底，同时比较两种编码并选较小 JPEG', async () => {
        const dimensions: number[][] = [];
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, type) {
            dimensions.push([this.width, this.height]);
            callback(new Blob([type === 'image/png' ? 'long png content' : 'jpeg'], { type }));
        });
        expect((await exportInk(strokes))[0]).toMatch(/^data:image\/jpeg;base64,/);
        expect(context.fillStyle).toBe('#111827');
        expect(context.fillRect).toHaveBeenCalledWith(0, 0, expect.any(Number), expect.any(Number));
        expect(context.translate).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
        expect(dimensions[0][0]).toBeLessThan(400);
        expect(dimensions[0][1]).toBeLessThan(300);
    });
    it('PNG 更小时保留无损图片', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob([type === 'image/png' ? 'png' : 'long jpeg content'], { type })));
        expect((await exportInk(strokes))[0]).toMatch(/^data:image\/png;base64,/);
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
    it('1300 以内沿用单张裁剪，长笔迹按纸面 1300 分成两张且不缩窄', async () => {
        const dimensions: number[][] = [];
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, type) {
            dimensions.push([this.width, this.height]);
            callback(new Blob(['small'], { type }));
        });
        expect(await exportInk(strokes)).toHaveLength(1);
        const long: InkStroke[] = [{ ...strokes[0], points: [[100, 30, 1], [300, 2570, 1]] }];
        dimensions.length = 0;
        expect(await exportInk(long)).toHaveLength(2);
        expect(dimensions.every(([width, height]) => width === 1000 && height <= 1300)).toBe(true);
        expect(context.translate).toHaveBeenCalledWith(-0, -1300);
    });
    it('1300 的判断只计笔迹，不把白边算成需要分段的内容', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob(['small'], { type })));
        const nearLimit: InkStroke[] = [{ ...strokes[0], points: [[100, 20, 1], [300, 1290, 1]] }];
        expect(await exportInk(nearLimit)).toHaveLength(1);
    });
    it('跨段笔画在两个独立画布上绘制，并由各自画布边界裁切', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob(['small'], { type })));
        const long: InkStroke[] = [{ ...strokes[0], points: [[100, 30, 1], [300, 2570, 1]] }];
        context.fill.mockClear();
        expect(inkSegments(long).map(box => box.y)).toEqual([0, 1300]);
        await exportInk(long);
        expect(context.fill).toHaveBeenCalledTimes(2);
    });
    it('长纸编码重试时宽度始终 1000，每张仍受字节上限约束', async () => {
        const widths: number[] = [];
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, type) {
            widths.push(this.width);
            callback(new Blob([new Uint8Array(MAX_ANSWER_IMAGE_BYTES + 1)], { type }));
        });
        await expect(exportInk([{ ...strokes[0], points: [[100, 30, 1], [300, 2570, 1]] }])).rejects.toThrow('IMAGE_EXPORT_TOO_LARGE');
        expect(widths).toEqual(Array(8).fill(1000));
    });

});
