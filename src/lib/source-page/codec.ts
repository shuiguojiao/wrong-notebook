import "server-only";

import { inflateSync } from "node:zlib";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { sniffImageFormat } from "@/lib/image-pipeline";
import { AgentInputError } from "@/lib/agent/errors";
import { SOURCE_PAGE_MAX_BYTES, SOURCE_PAGE_MAX_LONG_EDGE } from "./limits";

/** 在分配像素缓冲区前读取 PNG IHDR 或 JPEG SOF，拒绝超大图片。 */
export function inspectSourceImage(bytes: Buffer, mimeType: string) {
    if (!bytes.length) throw new AgentInputError("AGENT_SOURCE_INVALID");
    if (bytes.length > SOURCE_PAGE_MAX_BYTES) throw new AgentInputError("AGENT_SOURCE_TOO_LARGE", 413);
    const format = sniffImageFormat(bytes.subarray(0, 64));
    if (format !== "jpeg" && format !== "png") throw new AgentInputError("AGENT_SOURCE_FORMAT_UNSUPPORTED");
    if (mimeType !== `image/${format}`) throw new AgentInputError("AGENT_SOURCE_INVALID");
    let width = 0;
    let height = 0;
    if (format === "png") {
        if (bytes.length < 33 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
            || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") throw new AgentInputError("AGENT_SOURCE_INVALID");
        width = bytes.readUInt32BE(16);
        height = bytes.readUInt32BE(20);
    } else {
        let offset = 2;
        while (offset + 4 <= bytes.length) {
            if (bytes[offset++] !== 0xff) break;
            while (offset < bytes.length && bytes[offset] === 0xff) offset++;
            if (offset + 3 > bytes.length) break;
            const marker = bytes[offset++];
            if (marker === 0xda || marker === 0xd9) break;
            const length = bytes.readUInt16BE(offset);
            if (length < 2 || offset + length > bytes.length) break;
            if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
                height = bytes.readUInt16BE(offset + 3);
                width = bytes.readUInt16BE(offset + 5);
                break;
            }
            offset += length;
        }
    }
    if (!width || !height) throw new AgentInputError("AGENT_SOURCE_INVALID");
    if (Math.max(width, height) > SOURCE_PAGE_MAX_LONG_EDGE) throw new AgentInputError("AGENT_SOURCE_DIMENSIONS_EXCEEDED");
    return { format, width, height };
}

/** pngjs 对交错 PNG 的 inflate 未设置输出上限，先做有界校验并拒绝重复 IHDR。 */
function validatePngChunks(bytes: Buffer, width: number, height: number) {
    let offset = 8;
    let headers = 0;
    const compressed: Buffer[] = [];
    while (offset + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString("ascii", offset + 4, offset + 8);
        if (offset + length + 12 > bytes.length) throw new Error("PNG_CHUNK_INVALID");
        if (type === "IHDR") headers++;
        if (type === "IDAT") compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
        offset += length + 12;
        if (type === "IEND") break;
    }
    if (headers !== 1) throw new Error("PNG_HEADER_INVALID");
    if (bytes[28] === 1) {
        // 16 位 RGBA 和 Adam7 各次扫描的过滤字节均包括在保守上限内。
        inflateSync(Buffer.concat(compressed), { maxOutputLength: width * height * 8 + (width + height) * 8 + 1024 });
    }
}

export function decodeSourceImage(bytes: Buffer, mimeType: string) {
    const info = inspectSourceImage(bytes, mimeType);
    try {
        if (info.format === "png") validatePngChunks(bytes, info.width, info.height);
        const decoded = info.format === "jpeg"
            ? jpeg.decode(bytes, { useTArray: true, tolerantDecoding: false, maxResolutionInMP: 17, maxMemoryUsageInMB: 256 })
            : PNG.sync.read(bytes, { checkCRC: true });
        if (decoded.width !== info.width || decoded.height !== info.height) throw new Error("IMAGE_DIMENSIONS_MISMATCH");
        return { width: info.width, height: info.height, data: decoded.data };
    } catch {
        throw new AgentInputError("AGENT_SOURCE_INVALID");
    }
}
