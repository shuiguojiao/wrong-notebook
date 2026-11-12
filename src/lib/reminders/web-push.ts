import 'server-only';

import { createECDH, createHash } from 'node:crypto';
import { Agent, fetch } from 'undici';
import { generateRequestDetails, getVapidHeaders } from 'web-push';
import { z } from 'zod';
import { pinnedLookup, resolveReminderAddress } from './address';

function appleEndpoint(value: string) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.push.apple.com') || url.port
        || url.username || url.password || url.hash || url.pathname === '/' || url.href !== value) {
        throw new Error('INVALID_PUSH_ENDPOINT');
    }
    return url;
}

const base64url = (length: number) => z.string().regex(/^[A-Za-z0-9_-]+$/).refine(value => {
    if (value.length !== Math.ceil(length * 4 / 3)) return false;
    const decoded = Buffer.from(value, 'base64url');
    return decoded.length === length && decoded.toString('base64url') === value;
});
const publicKeySchema = base64url(65).refine(value => Buffer.from(value, 'base64url')[0] === 4);
export const webPushDeviceIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const webPushSubscriptionSchema = z.object({
    endpoint: z.string().max(2048).refine(value => {
        try { appleEndpoint(value); return true; } catch { return false; }
    }),
    keys: z.object({ p256dh: publicKeySchema, auth: base64url(16) }),
    vapidKey: publicKeySchema,
});
export const webPushDeviceId = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');

export function allowsWebPushMutation(request: Request) {
    const site = request.headers.get('sec-fetch-site');
    if (site === 'same-site' || site === 'cross-site') return false;
    const origin = request.headers.get('origin');
    return !origin || origin === new URL(request.url).origin
        || origin === process.env.NEXTAUTH_URL?.replace(/\/$/, '');
}

export function webPushConfig() {
    if (process.env.WEB_PUSH_ENABLED !== 'true') return null;
    const { WEB_PUSH_VAPID_PUBLIC_KEY: publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: privateKey, WEB_PUSH_VAPID_SUBJECT: subject } = process.env;
    if (!publicKey || !privateKey || !subject || !publicKeySchema.safeParse(publicKey).success
        || !base64url(32).safeParse(privateKey).success) return null;
    try {
        const site = new URL(process.env.NEXTAUTH_URL ?? '');
        if (site.protocol !== 'https:' || site.username || site.password) return null;
        const contact = new URL(subject);
        if (contact.protocol === 'mailto:' ? !contact.pathname : contact.protocol !== 'https:') return null;
        const key = createECDH('prime256v1');
        key.setPrivateKey(Buffer.from(privateKey, 'base64url'));
        if (key.getPublicKey().toString('base64url') !== publicKey) return null;
        return { publicKey, privateKey, subject };
    } catch { return null; }
}

type PushConfig = NonNullable<ReturnType<typeof webPushConfig>>;
type PushResult = 'accepted' | 'expired' | 'retry' | 'failed' | 'unknown';
const authorizationByOrigin = new Map<string, { value: string; refreshAt: number }>();

function pushAuthorization(origin: string, config: PushConfig) {
    const key = `${origin}|${config.publicKey}|${config.subject}`;
    const now = Date.now();
    const cached = authorizationByOrigin.get(key);
    if (cached && cached.refreshAt > now) return cached.value;
    const expiration = Math.floor(now / 1000) + 12 * 60 * 60;
    const value = getVapidHeaders(origin, config.subject, config.publicKey, config.privateKey, 'aes128gcm', expiration).Authorization;
    authorizationByOrigin.set(key, { value, refreshAt: now + 11 * 60 * 60_000 });
    return value;
}

export async function sendWebPush(
    device: { endpoint: string; p256dh: string; auth: string },
    config: PushConfig,
    notification: { title: string; body: string; tag: string },
    ttl: number,
): Promise<PushResult> {
    let agent: Agent | undefined;
    let requestStarted = false;
    let resolvingAddress = false;
    try {
        const url = appleEndpoint(device.endpoint);
        const request = generateRequestDetails(
            { endpoint: url.href, keys: { p256dh: device.p256dh, auth: device.auth } },
            JSON.stringify(notification),
            { contentEncoding: 'aes128gcm', TTL: ttl, topic: notification.tag },
        );
        const authorization = pushAuthorization(url.origin, config);
        const signal = AbortSignal.timeout(8000);
        resolvingAddress = true;
        const address = await resolveReminderAddress(url, false, signal);
        agent = new Agent({ connect: { lookup: pinnedLookup(address) } });
        requestStarted = true;
        const response = await fetch(url, {
            method: 'POST', headers: { ...request.headers, Authorization: authorization },
            body: request.body, redirect: 'error', signal, dispatcher: agent,
        });
        void response.body?.cancel().catch(() => undefined);
        if (response.ok) return 'accepted';
        if (response.status === 404 || response.status === 410) return 'expired';
        if (response.status === 429 || response.status >= 500) return 'retry';
        return 'failed';
    } catch {
        // 请求已经发出时无法判定是否受理，避免对同一设备重复发送。
        return requestStarted ? 'unknown' : resolvingAddress ? 'retry' : 'failed';
    } finally {
        if (agent) await agent.destroy().catch(() => undefined);
    }
}
