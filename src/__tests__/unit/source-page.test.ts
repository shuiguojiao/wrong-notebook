// @vitest-environment node
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { agentItemSchema, agentSourceSchema, agentUpdateSchema } from "@/lib/agent/schema";
import { inspectSourceImage, decodeSourceImage } from "@/lib/source-page/codec";
import { cropSourceImage } from "@/lib/source-page/crop";
import { sourceCropLayout, sourceRegionsSchema } from "@/lib/source-page/layout";
import { SOURCE_PAGE_MAX_BYTES } from "@/lib/source-page/limits";
import { MAX_ITEM_REGIONS, MIN_REGION_SIZE } from "@/lib/question-split/draft";
import { QUESTION_IMAGE_MAX_BYTES } from "@/lib/import/question-images";

const region = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
const sourcePage = { pageId: "test", regions: [region] };
const image = { base64: "AAAA", mimeType: "image/png" };

describe("出处区域与裁图布局", () => {
    it("区域数量与最小尺寸沿用网页约束，拒绝越界、非有限数与空区域", () => {
        expect(sourceRegionsSchema.parse(Array(MAX_ITEM_REGIONS).fill(region))).toHaveLength(4);
        for (const invalid of [[], Array(MAX_ITEM_REGIONS + 1).fill(region), [{ ...region, x: -0.1 }], [{ ...region, x: 0.9 }],
            [{ ...region, width: MIN_REGION_SIZE / 2 }], [{ ...region, height: 0 }], [{ ...region, y: NaN }], [{ ...region, width: Infinity }]]) {
            expect(sourceRegionsSchema.safeParse(invalid).success).toBe(false);
        }
    });
    it("边距换算为像素，贴边裁切；多框保持原宽度，左对齐并间隔 16 像素", () => {
        const layout = sourceCropLayout(1000, 2000, [region, { x: 0, y: 0, width: 0.1, height: 0.1 }]);
        expect(layout.crops).toEqual([{ x: 92, y: 384, width: 316, height: 832 }, { x: 0, y: 0, width: 108, height: 216 }]);
        expect(layout.rects).toEqual([{ x: 0, y: 0, width: 316, height: 832 }, { x: 0, y: 848, width: 108, height: 216 }]);
        expect(layout.output).toEqual({ width: 316, height: 1064 });
        const edge = sourceCropLayout(4096, 4096, [{ x: 0.99, y: 0.99, width: 0.01, height: 0.01 }]);
        expect(edge.crops[0].x + edge.crops[0].width).toBe(4096);
        const long = sourceCropLayout(4096, 4096, Array(4).fill({ x: 0, y: 0, width: 1, height: 1 }));
        expect(Math.max(long.output.width, long.output.height)).toBe(1600);
    });
    it("出处对象与 image 互斥，页标识与内嵌图片互斥，保留文字来源兼容", () => {
        expect(agentSourceSchema.safeParse(sourcePage).success).toBe(true);
        expect(agentSourceSchema.safeParse({ page: image, regions: [region] }).success).toBe(true);
        expect(agentSourceSchema.safeParse({ ...sourcePage, page: image }).success).toBe(false);
        expect(agentSourceSchema.safeParse({ regions: [region] }).success).toBe(false);
        expect(agentItemSchema.safeParse({ notebookId: "n", questionText: "题目", sourcePage, image }).success).toBe(false);
        expect(agentItemSchema.safeParse({ notebookId: "n", questionText: "题目", source: "期中", image }).success).toBe(true);
        expect(agentItemSchema.safeParse({ notebookId: "n", questionText: "题目", source: "期中", sourcePage }).success).toBe(true);
        expect(agentItemSchema.safeParse({ notebookId: "n", questionText: "题目", source: sourcePage }).success).toBe(false);
        expect(agentUpdateSchema.safeParse({ id: "i", expectedRevision: "a".repeat(64), patch: { sourcePage, image: null } }).success).toBe(false);
        expect(agentUpdateSchema.safeParse({ id: "i", expectedRevision: "a".repeat(64), patch: { source: "期中", sourcePage } }).success).toBe(true);
        expect(agentUpdateSchema.safeParse({ id: "i", expectedRevision: "a".repeat(64), patch: { source: sourcePage } }).success).toBe(false);
    });
});

describe("出处页编解码", () => {
    it("头部检查在解码前拒绝超大尺寸、体积、MIME 不符和不支持的格式", () => {
        const png = PNG.sync.write(new PNG({ width: 4, height: 4 }));
        const large = Buffer.from(png);
        large.writeUInt32BE(100000, 16);
        expect(() => decodeSourceImage(large, "image/png")).toThrow("AGENT_SOURCE_DIMENSIONS_EXCEEDED");
        expect(() => inspectSourceImage(Buffer.alloc(SOURCE_PAGE_MAX_BYTES + 1), "image/png")).toThrow("AGENT_SOURCE_TOO_LARGE");
        expect(() => inspectSourceImage(png, "image/jpeg")).toThrow("AGENT_SOURCE_INVALID");
        expect(() => inspectSourceImage(Buffer.from("RIFF0000WEBP"), "image/webp")).toThrow("AGENT_SOURCE_FORMAT_UNSUPPORTED");
        expect(() => inspectSourceImage(png.subarray(0, 24), "image/png")).toThrow("AGENT_SOURCE_INVALID");
        expect(() => inspectSourceImage(Buffer.from([0xff, 0xd8, 0xff, 0xff, 0xff, 0xff]), "image/jpeg")).toThrow("AGENT_SOURCE_INVALID");
        const jpg = jpeg.encode({ width: 1, height: 1, data: Buffer.alloc(4, 255) }).data;
        expect(inspectSourceImage(jpg, "image/jpeg")).toMatchObject({ width: 1, height: 1 });
        expect(() => decodeSourceImage(jpg.subarray(0, jpg.length - 50), "image/jpeg")).toThrow("AGENT_SOURCE_INVALID");
    });
    it("按区域顺序输出 JPEG，保持不同宽度、白色间隔和透明白底", () => {
        const page = new PNG({ width: 100, height: 100 });
        page.data.fill(255);
        for (let y = 0; y < 100; y++) {
            for (let x = 0; x < 100; x++) {
                const offset = (y * 100 + x) * 4;
                page.data[offset] = y < 50 ? 255 : 0;
                page.data[offset + 1] = 0;
                page.data[offset + 2] = y < 50 ? 0 : 255;
            }
        }
        const result = cropSourceImage(PNG.sync.write(page), "image/png", [
            { x: 0, y: 0.1, width: 1, height: 0.2 }, { x: 0, y: 0.7, width: 0.5, height: 0.2 },
        ]);
        const output = jpeg.decode(result);
        expect(output.width).toBe(100);
        expect(output.height).toBe(60);
        expect(output.data[(10 * 100 + 10) * 4]).toBeGreaterThan(240);
        expect(output.data[(50 * 100 + 10) * 4 + 2]).toBeGreaterThan(240);
        expect(output.data[(50 * 100 + 80) * 4 + 1]).toBeGreaterThan(240);
        expect(output.data[(30 * 100 + 10) * 4 + 1]).toBeGreaterThan(240);
        expect(result.length).toBeLessThanOrEqual(QUESTION_IMAGE_MAX_BYTES);
        const transparent = PNG.sync.write(new PNG({ width: 10, height: 10 }));
        const white = jpeg.decode(cropSourceImage(transparent, "image/png", [{ x: 0, y: 0, width: 1, height: 1 }]));
        expect([...white.data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    });
});
