import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch } from "undici";
import { sniffImageFormat } from "@/lib/image-pipeline";
import { AGENT_IMAGE_MAX_BYTES } from "@/lib/agent/schema";
import { isPublicAddress, pinnedLookup } from "@/lib/reminders/address";
import type { z } from "zod";
import type { agentImageSchema } from "@/lib/agent/schema";

/** 与复习提醒共用公网地址判定，避免两份保留网段列表不一致。 */
export const isPublicImageAddress = isPublicAddress;

/** 固定 DNS 解析后的公网地址，禁止重定向，避免 URL 抓图访问本机或内网服务。 */
async function downloadImage(value: string): Promise<{ bytes: Buffer; mimeType: string }> {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("AGENT_IMAGE_INVALID_URL");
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => !isPublicImageAddress(address))) throw new Error("AGENT_IMAGE_INVALID_URL");
    const pinned = addresses[0];
    const dispatcher = new Agent({ connect: { lookup: pinnedLookup(pinned) } });
    try {
        const response = await fetch(url, { dispatcher, redirect: "manual", signal: AbortSignal.timeout(10_000) });
        try {
            if (!response.ok || !response.body || Number(response.headers.get("content-length")) > AGENT_IMAGE_MAX_BYTES) throw new Error("AGENT_IMAGE_INVALID_DATA");
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of response.body) {
                size += chunk.length;
                if (size > AGENT_IMAGE_MAX_BYTES) throw new Error("AGENT_IMAGE_TOO_LARGE");
                chunks.push(Buffer.from(chunk));
            }
            return { bytes: Buffer.concat(chunks), mimeType: response.headers.get("content-type")?.split(";")[0].trim() ?? "" };
        } finally { await response.body?.cancel().catch(() => undefined); }
    } finally { await dispatcher.close(); }
}

/** 服务端校验文件头与 MIME 后交给 saveQuestion 的 image-storage 落盘；无图沿用空串。 */
export async function prepareAgentImage(image?: z.infer<typeof agentImageSchema>): Promise<string> {
    if (!image) return "";
    let bytes: Buffer;
    let mimeType: string;
    if ("url" in image) ({ bytes, mimeType } = await downloadImage(image.url));
    else {
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)) throw new Error("AGENT_IMAGE_INVALID_DATA");
        bytes = Buffer.from(image.base64, "base64");
        if (bytes.toString("base64").replace(/=+$/, "") !== image.base64.replace(/=+$/, "")) throw new Error("AGENT_IMAGE_INVALID_DATA");
        mimeType = image.mimeType;
    }
    const format = sniffImageFormat(bytes.subarray(0, 64));
    if (!bytes.length || bytes.length > AGENT_IMAGE_MAX_BYTES || !["jpeg", "png", "webp"].includes(format) || mimeType !== `image/${format}`) throw new Error("AGENT_IMAGE_INVALID_DATA");
    return `data:${mimeType};base64,${bytes.toString("base64")}`;
}
