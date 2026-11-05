import "server-only";

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { Agent, fetch } from "undici";
import { sniffImageFormat } from "@/lib/image-pipeline";
import { AGENT_IMAGE_MAX_BYTES } from "@/lib/agent/schema";
import type { z } from "zod";
import type { agentImageSchema } from "@/lib/agent/schema";

const blocked = new BlockList();
for (const [address, prefix] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) blocked.addSubnet(address, prefix, "ipv4");

const blockedV6 = new BlockList();
blockedV6.addSubnet("2001::", 23, "ipv6");
blockedV6.addSubnet("2001:db8::", 32, "ipv6");
blockedV6.addSubnet("2002::", 16, "ipv6");

export function isPublicImageAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return !blocked.check(address, "ipv4");
    // 仅允许全球单播 IPv6，排除回环、映射 IPv4、链路本地、ULA 和文档地址。
    return family === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !blockedV6.check(address, "ipv6");
}

/** 固定 DNS 解析后的公网地址，禁止重定向，避免 URL 抓图访问本机或内网服务。 */
async function downloadImage(value: string): Promise<{ bytes: Buffer; mimeType: string }> {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("AGENT_IMAGE_INVALID_URL");
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => !isPublicImageAddress(address))) throw new Error("AGENT_IMAGE_INVALID_URL");
    const pinned = addresses[0];
    const dispatcher = new Agent({ connect: { lookup: (_host, options, callback) => {
        if (options.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
    } } });
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
