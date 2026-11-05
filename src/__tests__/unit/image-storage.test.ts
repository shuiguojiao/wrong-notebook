// @vitest-environment node
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { imageDataUrl, isLocalImage, localImagePath, mapImageFields, portableImage, readStoredImage, storeImage } from "@/lib/image-storage";

const image = "data:image/png;base64,aGVsbG8=";

describe("本地题目图片存储", () => {
    it("按内容去重并保存二进制，读取兼容旧 data URL", async () => {
        const [first, second] = await Promise.all([storeImage(image), storeImage(image)]);
        expect(first).toBe(second);
        expect(isLocalImage(first)).toBe(true);
        expect(await readFile(localImagePath(first))).toEqual(Buffer.from("hello"));
        expect(await imageDataUrl(first)).toBe(image);
        expect(await readStoredImage(image)).toEqual({ bytes: Buffer.from("hello"), mimeType: "image/png" });
        expect(await storeImage("")).toBe("");
        expect(await imageDataUrl("https://example.com/image.jpg")).toBe("https://example.com/image.jpg");
    });

    it("拒绝路径穿越、损坏文件和外部提交的内部引用", async () => {
        expect(() => localImagePath("local-image:../../secret")).toThrow("INVALID_LOCAL_IMAGE");
        await expect(imageDataUrl("local-image:../../secret")).rejects.toThrow("INVALID_LOCAL_IMAGE");
        const reference = await storeImage("data:image/png;base64,Y29ycnVwdA==");
        await expect(portableImage(reference)).rejects.toThrow("LOCAL_IMAGE_REFERENCE_NOT_PORTABLE");
        await writeFile(localImagePath(reference), "damaged");
        await expect(imageDataUrl(reference)).rejects.toThrow("IMAGE_CHECKSUM_MISMATCH");
        await expect(storeImage("data:image/png;base64,Y29ycnVwdA==")).rejects.toThrow("IMAGE_CHECKSUM_MISMATCH");
    });

    it("备份转换覆盖记录、任务和 JSON 草稿，保留日期与题干文本", async () => {
        const date = new Date();
        const source = { createdAt: date, questionText: image, originalImageUrl: image, tasks: [{ imageData: image }], draft: JSON.stringify({ items: [{ image }] }) };
        const stored = await mapImageFields(source, storeImage);
        expect(stored.createdAt).toBe(date);
        expect(stored.questionText).toBe(image);
        expect(isLocalImage(stored.originalImageUrl)).toBe(true);
        expect(isLocalImage(JSON.parse(stored.draft).items[0].image)).toBe(true);
        expect(await mapImageFields(stored, imageDataUrl)).toEqual(source);
    });
});
