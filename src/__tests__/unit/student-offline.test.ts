import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext, runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { en } from "@/lib/i18n/en";
import { zh } from "@/lib/i18n/zh";

const worker = readFileSync(resolve("public/sw.js"), "utf8");
const offlineHtml = readFileSync(resolve("public/offline.html"), "utf8");
interface WorkerRequest {
    method: string;
    mode: string;
    url: string;
}
interface WorkerEvent {
    request: WorkerRequest;
    respondWith: (response: Promise<Response>) => void;
    waitUntil: (work: Promise<unknown>) => void;
    data?: { json: () => unknown };
    notification?: { close: () => void };
}

function createWorker() {
    const listeners: Record<string, (event: WorkerEvent) => void> = {};
    const offline = new Response("离线提示页");
    const match = vi.fn<(key: string | WorkerRequest) => Promise<Response | undefined>>(async () => offline);
    const cache = { addAll: vi.fn(async () => undefined), put: vi.fn(async () => undefined), keys: vi.fn(async () => []), delete: vi.fn() };
    const caches = { match, open: vi.fn(async () => cache), keys: vi.fn(async () => ["wrong-notebook-static-v1"]), delete: vi.fn(async () => true) };
    const fetch = vi.fn<(request: WorkerRequest) => Promise<Response>>(async () => new Response("服务器页面"));
    const clients = { claim: vi.fn(), matchAll: vi.fn<() => Promise<Array<{ url: string; focus: () => void }>>>(), openWindow: vi.fn() };
    const registration = { showNotification: vi.fn() };
    const self = { location: { origin: "https://test.invalid" }, addEventListener: (name: string, listener: (event: WorkerEvent) => void) => { listeners[name] = listener; }, skipWaiting: vi.fn(), clients, registration };
    const context = createContext({ self, caches, fetch, URL });
    runInContext(worker, context);
    const dispatch = (path: string, mode = "navigate", method = "GET") => {
        const respondWith = vi.fn();
        const waitUntil = vi.fn();
        listeners.fetch({ request: { url: new URL(path, self.location.origin).href, mode, method }, respondWith, waitUntil });
        return { respondWith, response: respondWith.mock.calls[0]?.[0] as Promise<Response> | undefined };
    };
    return { offline, match, cache, caches, fetch, dispatch, listeners, context, clients, registration };
}

describe("复习推送", () => {
    const workerEvent = () => ({ request: { method: "GET", mode: "", url: "" }, respondWith: vi.fn(), waitUntil: vi.fn() });

    it("后台显示提醒，无法读取正文时也显示可见通知", () => {
        const worker = createWorker();
        const event = workerEvent();
        worker.listeners.push({ ...event, data: { json: () => ({ title: "错题本", body: "有错题待复习", tag: "review-2026-11-12" }) } });
        expect(worker.registration.showNotification).toHaveBeenCalledWith("错题本", { body: "有错题待复习", tag: "review-2026-11-12" });
        worker.listeners.push({ ...event, data: { json: () => { throw new Error("无法解析"); } } });
        expect(worker.registration.showNotification).toHaveBeenLastCalledWith("错题本复习提醒", { body: "打开错题本查看复习", tag: "review" });
    });

    it("点击通知时聚焦已打开的复习页，或打开同站复习页", async () => {
        const worker = createWorker();
        const event = { ...workerEvent(), notification: { close: vi.fn() } };
        const focus = vi.fn();
        const url = "https://test.invalid/review";
        worker.clients.matchAll.mockResolvedValueOnce([{ url, focus }]).mockResolvedValueOnce([]);
        worker.listeners.notificationclick(event);
        await event.waitUntil.mock.calls[0][0];
        expect(event.notification.close).toHaveBeenCalled();
        expect(focus).toHaveBeenCalledOnce();
        expect(worker.clients.openWindow).not.toHaveBeenCalled();
        worker.listeners.notificationclick(event);
        await event.waitUntil.mock.calls[1][0];
        expect(worker.clients.openWindow).toHaveBeenCalledWith(url);
    });
});

describe("导航离线回退", () => {
    it.each([502, 503, 504, 520, 524, 530])("%s 响应由纯状态判断及实际导航分发回退到离线页，恢复后仍走网络", async status => {
        const worker = createWorker();
        const shouldFallback = runInContext("shouldUseOfflineFallback", worker.context) as (status: number) => boolean;
        expect(shouldFallback(status)).toBe(true);
        worker.fetch.mockResolvedValueOnce(new Response("网关错误", { status }));
        expect(await worker.dispatch("/notebooks").response).toBe(worker.offline);
        expect(worker.match).toHaveBeenCalledWith("/offline.html");
        const recovered = new Response("恢复后的页面");
        worker.fetch.mockResolvedValueOnce(recovered);
        expect(await worker.dispatch("/notebooks").response).toBe(recovered);
        expect(worker.cache.put).not.toHaveBeenCalled();
    });

    it("网络抛错时回退；没有离线缓存时保留网络原始错误", async () => {
        const worker = createWorker();
        const failure = new TypeError("离线");
        worker.fetch.mockRejectedValue(failure);
        expect(await worker.dispatch("/review").response).toBe(worker.offline);
        worker.match.mockResolvedValue(undefined);
        await expect(worker.dispatch("/review").response).rejects.toBe(failure);
    });

    it.each([200, 302, 401, 403, 404, 500])("不替换 %s 响应", async status => {
        const worker = createWorker();
        const response = new Response("原始响应", { status });
        worker.fetch.mockResolvedValue(response);
        expect(await worker.dispatch("/").response).toBe(response);
        expect(worker.match).not.toHaveBeenCalled();
    });

    it("网关错误且无离线缓存时返回原响应", async () => {
        const worker = createWorker();
        worker.match.mockResolvedValue(undefined);
        const response = new Response("网关错误", { status: 503 });
        worker.fetch.mockResolvedValue(response);
        expect(await worker.dispatch("/").response).toBe(response);
    });
});

describe("缓存边界", () => {
    it.each(["/api", "/api/error-items", "/api/auth/signin", "https://elsewhere.invalid/notebooks"])("不接管 %s，即便请求被标记为导航", path => {
        const worker = createWorker();
        expect(worker.dispatch(path).respondWith).not.toHaveBeenCalled();
        expect(worker.fetch).not.toHaveBeenCalled();
        expect(worker.caches.open).not.toHaveBeenCalled();
    });

    it("登录与业务页面只读网络，从不写入缓存，非 GET 不接管", async () => {
        const worker = createWorker();
        await worker.dispatch("/login").response;
        await worker.dispatch("/notebooks").response;
        expect(worker.cache.put).not.toHaveBeenCalled();
        expect(worker.caches.open).not.toHaveBeenCalled();
        expect(worker.dispatch("/notebooks", "navigate", "POST").respondWith).not.toHaveBeenCalled();
        expect(worker.dispatch("/login", "cors").respondWith).not.toHaveBeenCalled();
        expect(worker.dispatch("/api/error-items", "cors").respondWith).not.toHaveBeenCalled();
    });

    it("仅静态资源可写缓存；重定向登录响应不得写入", async () => {
        const worker = createWorker();
        worker.match.mockResolvedValue(undefined);
        const resource = new Response("静态资源");
        Object.defineProperty(resource, "type", { value: "basic" });
        worker.fetch.mockResolvedValueOnce(resource);
        await worker.dispatch("/_next/static/chunk.js", "cors").response;
        expect(worker.cache.put).toHaveBeenCalledOnce();
        const redirected = new Response("登录页");
        Object.defineProperties(redirected, { type: { value: "basic" }, redirected: { value: true } });
        worker.fetch.mockResolvedValueOnce(redirected);
        await worker.dispatch("/_next/static/another.js", "cors").response;
        expect(worker.cache.put).toHaveBeenCalledOnce();
    });

    it("安装只预存离线页与图标，激活清除旧缓存", async () => {
        const worker = createWorker();
        const waitUntil = vi.fn();
        const event = { request: { method: "GET", mode: "navigate", url: "" }, respondWith: vi.fn(), waitUntil };
        worker.listeners.install(event);
        await waitUntil.mock.calls[0][0];
        expect(worker.cache.addAll).toHaveBeenCalledWith(["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"]);
        worker.listeners.activate(event);
        await waitUntil.mock.calls[1][0];
        expect(worker.caches.delete).toHaveBeenCalledWith("wrong-notebook-static-v1");
    });
});

describe("静态离线页与缩放", () => {
    it.each([["zh-CN", zh], ["en-US", en]] as const)("%s 提示与 i18n 一致，重试及联网可恢复，始终有静态回今天出口", (language, t) => {
        const document = new DOMParser().parseFromString(offlineHtml, "text/html");
        const reload = vi.fn();
        const onlineListeners: Record<string, () => void> = {};
        const script = document.querySelector("script")!.textContent!;
        runInNewContext(script, { document, navigator: { language }, location: { reload }, window: { addEventListener: (name: string, callback: () => void) => { onlineListeners[name] = callback; } } });
        expect(document.querySelector("h1")?.textContent).toBe(t.student.networkNotice);
        expect(document.querySelector("p")?.textContent).toBe(t.student.offlineHint);
        expect(document.querySelector("button")?.textContent).toBe(t.importFlow.retryLoad);
        expect(document.querySelector("a")?.textContent).toBe(t.student.backToToday);
        expect(document.querySelector("a")?.getAttribute("href")).toBe("/");
        document.querySelector("button")!.click();
        expect(reload).toHaveBeenCalledOnce();
        onlineListeners.online();
        expect(reload).toHaveBeenCalledTimes(2);
        // 即使脚本未执行，中文静态出口仍可使用。
        expect(offlineHtml).toContain('<a id="today" href="/">回今天</a>');
        expect(document.querySelector('meta[name="viewport"]')?.getAttribute("content")).not.toMatch(/maximum-scale|user-scalable/);
    });

    it("应用 viewport 保留设备宽度和安全区，不限制用户缩放", () => {
        const layout = readFileSync(resolve("src/app/layout.tsx"), "utf8");
        const viewport = layout.match(/export const viewport: Viewport = \{([\s\S]*?)\};/)![1];
        expect(viewport).toContain("width: 'device-width'");
        expect(viewport).toContain("viewportFit: 'cover'");
        expect(viewport).not.toMatch(/maximumScale|userScalable/);
    });
});
