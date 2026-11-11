/**
 * 扫描版 PDF 渲染的纯函数测试：页码范围解析、渲染缩放与输出尺寸计算。
 */
import { describe, expect, it, vi } from "vitest";
import {
    computePdfOutputSize,
    computePdfRenderScale,
    MAX_SCAN_PAGES_PER_IMPORT,
    parsePageRanges,
    renderPdfPages,
} from "@/lib/import/file-parsers/pdf/render-pages";
import { DEFAULT_IMAGE_LIMITS } from "@/lib/image-pipeline";

describe("parsePageRanges", () => {
    it("解析单页、范围与组合（去重升序）", () => {
        expect(parsePageRanges("3", 10)).toEqual({ ok: true, pages: [3] });
        expect(parsePageRanges("1-3", 10)).toEqual({ ok: true, pages: [1, 2, 3] });
        expect(parsePageRanges("1-3,5", 10)).toEqual({ ok: true, pages: [1, 2, 3, 5] });
        expect(parsePageRanges("5,1-3,2", 10)).toEqual({ ok: true, pages: [1, 2, 3, 5] });
        expect(parsePageRanges("3-1", 10).ok).toBe(false);
    });

    it("支持中文逗号、顿号与空格", () => {
        expect(parsePageRanges("1，3", 10)).toEqual({ ok: true, pages: [1, 3] });
        expect(parsePageRanges("1、3", 10)).toEqual({ ok: true, pages: [1, 3] });
        expect(parsePageRanges("1 - 3 , 5", 10)).toEqual({ ok: true, pages: [1, 2, 3, 5] });
    });

    it("页码超出范围返回错误", () => {
        const result = parsePageRanges("1-11", 10);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe("out_of_range");
        expect(parsePageRanges("0", 10).ok).toBe(false);
        expect(parsePageRanges("1-3", 2).ok).toBe(false);
    });

    it("空输入与无法识别的段返回错误", () => {
        expect(parsePageRanges("", 10).ok).toBe(false);
        expect(parsePageRanges("  ", 10).ok).toBe(false);
        expect(parsePageRanges("abc", 10).ok).toBe(false);
        expect(parsePageRanges("1-a", 10).ok).toBe(false);
    });

    it("超过单次上限（20 页）返回错误", () => {
        const result = parsePageRanges("1-21", 30);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.message).toContain(String(MAX_SCAN_PAGES_PER_IMPORT));
        // 恰好 20 页通过
        expect(parsePageRanges("1-20", 30)).toEqual({
            ok: true,
            pages: Array.from({ length: 20 }, (_, i) => i + 1),
        });
    });
});

describe("computePdfRenderScale / computePdfOutputSize", () => {
    it("A4 按输出限制放大，保留扫描文字细节", () => {
        const output = computePdfOutputSize(595, 842);
        expect(output.scale).toBeGreaterThan(3);
        expect(output.width).toBeGreaterThan(1800);
        expect(output.width * output.height).toBeLessThanOrEqual(DEFAULT_IMAGE_LIMITS.maxPixels);
        expect(computePdfRenderScale(100, 100)).toBe(4);
    });

    it("长边超限按时长边缩放", () => {
        const scale = computePdfRenderScale(DEFAULT_IMAGE_LIMITS.maxLongEdge * 2, 1000, DEFAULT_IMAGE_LIMITS);
        expect(scale).toBeCloseTo(0.5, 5);
        const output = computePdfOutputSize(DEFAULT_IMAGE_LIMITS.maxLongEdge * 2, 1000, DEFAULT_IMAGE_LIMITS);
        expect(output.width).toBe(DEFAULT_IMAGE_LIMITS.maxLongEdge);
        expect(output.height).toBe(500);
    });

    it("总像素超限时按像素缩放", () => {
        // 2000×3000 = 6,000,000 像素，超过 2560×1920 = 4,915,200
        const scale = computePdfRenderScale(2000, 3000, DEFAULT_IMAGE_LIMITS);
        expect(scale).toBeCloseTo(Math.sqrt(DEFAULT_IMAGE_LIMITS.maxPixels / 6_000_000), 5);
        const output = computePdfOutputSize(2000, 3000, DEFAULT_IMAGE_LIMITS);
        expect(output.width * output.height).toBeLessThanOrEqual(DEFAULT_IMAGE_LIMITS.maxPixels);
    });

    it("输出尺寸至少为 1 像素", () => {
        const output = computePdfOutputSize(0.1, 0.1, DEFAULT_IMAGE_LIMITS);
        expect(output.width).toBeGreaterThanOrEqual(1);
        expect(output.height).toBeGreaterThanOrEqual(1);
    });
});

it('JPEG 超限时先降质量，再缩小重渲染，并清理文档', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn() } as unknown as CanvasRenderingContext2D);
    const qualities: number[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, _type, quality) {
        qualities.push(Number(quality));
        const bytes = this.width > 1500 ? 300 : 60;
        callback(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
    });
    const render = vi.fn(() => ({ promise: Promise.resolve() }));
    const cleanup = vi.fn();
    const doc = { numPages: 1, cleanup, getPage: async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }), render }) };
    const [page] = await renderPdfPages(doc, { pages: [1], limits: { ...DEFAULT_IMAGE_LIMITS, maxBytes: 100 } });
    expect(page.bytes).toBeLessThanOrEqual(100);
    expect(page.width).toBeLessThanOrEqual(1500);
    expect(qualities).toContain(DEFAULT_IMAGE_LIMITS.minQuality);
    expect(render.mock.calls.length).toBeGreaterThan(1);
    expect(cleanup).toHaveBeenCalledOnce();
});
