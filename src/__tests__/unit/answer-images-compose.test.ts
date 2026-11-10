import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeAnswerImages } from '@/lib/handwriting/compose';
import { MAX_ANSWER_IMAGE_BYTES } from '@/lib/handwriting/image';
import { ANSWER_IMAGE } from '../fixtures/handwriting';

const context = { fillStyle: '', fillRect: vi.fn(), scale: vi.fn(), drawImage: vi.fn() };
let decoded: HTMLImageElement[];

beforeEach(() => {
    decoded = [];
    vi.stubGlobal('Image', class {
        naturalWidth = 500;
        naturalHeight = 250;
        onload?: () => void;
        onerror?: () => void;
        set src(value: string) {
            decoded.push(this as unknown as HTMLImageElement);
            if (value === 'broken') this.onerror?.();
            else this.onload?.();
        }
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['jpeg'], { type: 'image/jpeg' })));
});

afterEach(() => vi.unstubAllGlobals());

describe('答案展示图拼接', () => {
    it('单张原样返回，无需解码或画布', async () => {
        expect(await composeAnswerImages([ANSWER_IMAGE])).toBe(ANSWER_IMAGE);
        expect(decoded).toEqual([]);
        expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    });

    it('多张按顺序缩放到宽 1000，白底且以 24px 浅灰分隔', async () => {
        const dimensions: number[][] = [];
        const fills: unknown[][] = [];
        context.fillRect.mockImplementation((...args: number[]) => { fills.push([context.fillStyle, ...args]); });
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
            dimensions.push([this.width, this.height]);
            callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
        });
        expect(await composeAnswerImages(['first', 'second'])).toMatch(/^data:image\/jpeg;base64,/);
        expect(dimensions).toEqual([[1000, 1024]]);
        expect(fills).toEqual([['#ffffff', 0, 0, 1000, 1024], ['#f1f5f9', 0, 500, 1000, 24]]);
        expect(context.drawImage.mock.calls).toEqual([[decoded[0], 0, 0, 1000, 500], [decoded[1], 0, 524, 1000, 500]]);
    });

    it('依次降低 JPEG 质量，达到大小上限即停止', async () => {
        const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type, quality) => {
            callback(new Blob([new Uint8Array(quality! > 0.65 ? MAX_ANSWER_IMAGE_BYTES + 1 : 20)], { type }));
        });
        await composeAnswerImages(['first', 'second']);
        expect(encode.mock.calls.map(call => [call[1], call[2]])).toEqual([
            ['image/jpeg', 0.85], ['image/jpeg', 0.75], ['image/jpeg', 0.65],
        ]);
    });

    it('所有质量仍超限时整体等比例缩小并重试', async () => {
        const dimensions: number[][] = [];
        const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, type) {
            dimensions.push([this.width, this.height]);
            callback(new Blob([new Uint8Array(this.width === 1000 ? MAX_ANSWER_IMAGE_BYTES * 4 : 20)], { type }));
        });
        await composeAnswerImages(['first', 'second']);
        expect(encode.mock.calls.map(call => call[2])).toEqual([0.85, 0.75, 0.65, 0.55, 0.85]);
        expect(dimensions.at(-1)).toEqual([450, 461]);
        expect(context.scale).toHaveBeenLastCalledWith(0.45, 0.45);
    });

    it('缩小到极限仍超限时抛错', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob([new Uint8Array(MAX_ANSWER_IMAGE_BYTES * 100)])));
        await expect(composeAnswerImages(['first', 'second'])).rejects.toThrow('IMAGE_EXPORT_TOO_LARGE');
    });

    it('空列表或解码失败时抛错', async () => {
        await expect(composeAnswerImages([])).rejects.toThrow('IMAGE_EXPORT_FAILED');
        await expect(composeAnswerImages(['first', 'broken'])).rejects.toThrow('IMAGE_EXPORT_FAILED');
    });

    it('画布不可用或编码失败时抛错', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValueOnce(null);
        await expect(composeAnswerImages(['first', 'second'])).rejects.toThrow('IMAGE_EXPORT_FAILED');
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(null));
        await expect(composeAnswerImages(['first', 'second'])).rejects.toThrow('IMAGE_EXPORT_FAILED');
    });
});
