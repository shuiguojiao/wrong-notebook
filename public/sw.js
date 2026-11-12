/*
 * 错题本 PWA Service Worker
 *
 * - 页面导航：始终走网络，断网、网关或 Cloudflare 源站错误时返回离线页 /offline.html
 * - /_next/static、/icons：文件名带哈希或基本不变，缓存优先
 * - API 与其他请求不经过缓存，保证数据始终来自服务器
 */
const VERSION = 'v2';
const STATIC_CACHE = `wrong-notebook-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];
/** 静态缓存最多保留的条目数，超出后删除最早写入的 */
const MAX_STATIC_ENTRIES = 300;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith('wrong-notebook-') && key !== STATIC_CACHE)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

function isStaticAsset(url) {
    return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

async function trimCache(cache) {
    const keys = await cache.keys();
    const excess = keys.length - MAX_STATIC_ENTRIES;
    for (let i = 0; i < excess; i++) {
        if (!keys[i].url.endsWith(OFFLINE_URL)) await cache.delete(keys[i]);
    }
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    // 重定向可能落到登录页，不能将其作为静态资源缓存。
    if (response.ok && response.type === 'basic' && !response.redirected) {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, response.clone());
        trimCache(cache);
    }
    return response;
}

async function networkWithOfflineFallback(request) {
    try {
        const response = await fetch(request);
        if (shouldUseOfflineFallback(response.status)) {
            return (await caches.match(OFFLINE_URL)) || response;
        }
        return response;
    } catch (error) {
        const offline = await caches.match(OFFLINE_URL);
        if (offline) return offline;
        throw error;
    }
}

function shouldUseOfflineFallback(status) {
    // 502–504 为网关错误；520–524、530 是 Cloudflare 的源站与隧道错误（如 1033 返回 530），
    // 这些情况显示自己的离线页，而不是英文错误页。
    return status === 502 || status === 503 || status === 504
        || (status >= 520 && status <= 524) || status === 530;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    // 即使用户直接打开 API 地址，也不将业务响应替换成离线页面。
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(networkWithOfflineFallback(request));
        return;
    }

    if (isStaticAsset(url)) {
        event.respondWith(cacheFirst(request));
    }
});

self.addEventListener('message', (event) => {
    if (event.data === 'review-push-ready') event.ports[0]?.postMessage(true);
});

self.addEventListener('push', (event) => {
    let message;
    try { message = event.data?.json(); } catch { /* 无法解析时仍展示通用提醒。 */ }
    const tag = typeof message?.tag === 'string' && /^review-(test|\d{4}-\d{2}-\d{2})$/.test(message.tag)
        ? message.tag : 'review';
    event.waitUntil(self.registration.showNotification(
        typeof message?.title === 'string' && message.title ? message.title : '错题本复习提醒',
        { body: typeof message?.body === 'string' ? message.body : '打开错题本查看复习', tag },
    ));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const reviewUrl = new URL('/review', self.location.origin).href;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const review = windows.find(client => client.url === reviewUrl);
        if (review) return review.focus();
        return self.clients.openWindow(reviewUrl);
    })());
});
