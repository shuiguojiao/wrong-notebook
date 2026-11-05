// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), fetch: vi.fn(), agent: vi.fn(), close: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("undici", () => ({ fetch: mocks.fetch, Agent: class {
    constructor(options: unknown) { mocks.agent(options); }
    close() { return mocks.close(); }
} }));
import { prepareAgentImage, isPublicImageAddress } from "@/lib/agent/image";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

beforeEach(() => {
    vi.resetAllMocks();
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    mocks.close.mockResolvedValue(undefined);
});
describe("代理抓图网络边界", () => {
    it("公网 HTTPS 下载固定 DNS 地址并保存 data URL", async () => {
        mocks.fetch.mockResolvedValue(new Response(Buffer.from(png, "base64"), { headers: { "Content-Type": "image/png" } }));
        expect(await prepareAgentImage({ url: "https://image.example/a.png" })).toBe(`data:image/png;base64,${png}`);
        expect(mocks.fetch.mock.calls[0][1].redirect).toBe("manual");
        const callback = vi.fn();
        mocks.agent.mock.calls[0][0].connect.lookup("image.example", { all: true }, callback);
        expect(callback).toHaveBeenCalledWith(null, [{ address: "8.8.8.8", family: 4 }]);
        expect(mocks.close).toHaveBeenCalledOnce();
    });
    it.each(["https://127.0.0.1/a.png", "http://image.example/a.png", "https://a:b@image.example/a.png", "https://image.example:8443/a.png"])('拒绝私网或不安全 URL：%s', async (url) => {
        await expect(prepareAgentImage({ url })).rejects.toThrow();
        expect(mocks.fetch).not.toHaveBeenCalled();
    });
    it("DNS 同时含公网与私网时整体拒绝", async () => {
        mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]);
        await expect(prepareAgentImage({ url: "https://image.example/a.png" })).rejects.toThrow("AGENT_IMAGE_INVALID_URL");
        expect(mocks.fetch).not.toHaveBeenCalled();
    });
    it.each([
        () => new Response(null, { status: 302, headers: { Location: "https://127.0.0.1" } }),
        () => new Response("oversized", { headers: { "Content-Length": String(6 * 1024 * 1024) } }),
        () => new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { "Content-Type": "image/png" } }),
    ])("拒绝重定向、声明超限和流式超限响应并关闭连接", async (response) => {
        mocks.fetch.mockResolvedValue(response());
        await expect(prepareAgentImage({ url: "https://image.example/a.png" })).rejects.toThrow();
        expect(mocks.close).toHaveBeenCalledOnce();
    });
    it.each(["::1", "::ffff:127.0.0.1", "fe80::1", "fc00::1", "2001::1", "2001:db8::1", "2002:7f00:1::", "169.254.169.254", "100.64.0.1"])("拒绝特殊地址 %s", (address) => {
        expect(isPublicImageAddress(address)).toBe(false);
    });
});
