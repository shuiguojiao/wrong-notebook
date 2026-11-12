// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { generateVAPIDKeys } from 'web-push';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    database: undefined as PrismaClient | undefined,
    email: 'reminder@example.com', role: 'user', policy: { allowCustomReminders: false, allowPrivateReminders: false },
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), deviceCookie: '',
}));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.database; } }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: mocks.email, role: mocks.role } }) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: mocks.deviceCookie }) }) }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => mocks.policy, getAppTimeZone: () => 'Asia/Shanghai' }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), info: mocks.info, warn: mocks.warn, error: mocks.error }) }));
vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '8.8.8.8', family: 4 }] }));
vi.mock('undici', async (importOriginal) => ({ ...await importOriginal<typeof import('undici')>(), fetch: (...args: Parameters<typeof fetch>) => fetch(...args) }));
import { GET, PUT } from '@/app/api/reminders/route';
import { POST as TEST } from '@/app/api/reminders/test/route';
import { GET as LIST_DEVICES, POST as REGISTER_DEVICE, DELETE as REMOVE_DEVICE } from '@/app/api/reminders/devices/route';
import { authOptions } from '@/lib/auth';
import { WEB_PUSH_DEVICE_COOKIE } from '@/lib/reminders/schema';
import { runReminders } from '@/lib/reminders/service';
const now = new Date('2026-11-05T04:00:00Z');
const settings = { reminderEnabled: true, reminderChannel: 'bark', reminderCredential: 'private-test-key', reminderTime: '09:00' };
let directory: string;
let db: PrismaClient;
const put = (value: object) => PUT(new Request('http://localhost/api/reminders', { method: 'PUT', body: JSON.stringify(value) }));
beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'wrong-notebook-reminders-'));
    const url = `file:${join(directory, 'test.db')}`;
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    db = new PrismaClient({ datasources: { db: { url } } }); mocks.database = db;
}, 120000);
beforeEach(async () => {
    mocks.email = 'reminder@example.com'; mocks.role = 'user'; mocks.policy = { allowCustomReminders: false, allowPrivateReminders: false }; mocks.deviceCookie = '';
    await db.user.deleteMany();
    await db.user.create({ data: { id: 'u', email: mocks.email, password: 'test-only' } });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 200 })));
});

describe('Apple 设备通知', () => {
    const vapid = generateVAPIDKeys();
    const deviceKeys = { p256dh: generateVAPIDKeys().publicKey, auth: Buffer.alloc(16, 12).toString('base64url') };
    const pushSettings = { reminderEnabled: true, reminderChannel: 'web_push', reminderTime: '09:00' };
    const endpoint = (name: string) => `https://web.push.apple.com/${name}`;
    const register = (url: string) => REGISTER_DEVICE(new Request('https://notebook.example/api/reminders/devices', {
        method: 'POST', body: JSON.stringify({ endpoint: url, keys: deviceKeys, vapidKey: vapid.publicKey }),
    }));
    const add = async (name: string) => {
        const result = await register(endpoint(name));
        expect(result.status).toBe(200);
        return await result.json() as { id: string };
    };
    const test = (id: string, cookieId = id) => TEST(new Request('https://notebook.example/api/reminders/test', {
        method: 'POST', headers: { cookie: `${WEB_PUSH_DEVICE_COOKIE}=${cookieId}` }, body: JSON.stringify({ deviceId: id }),
    }));

    beforeEach(() => {
        vi.stubEnv('WEB_PUSH_ENABLED', 'true');
        vi.stubEnv('WEB_PUSH_VAPID_PUBLIC_KEY', vapid.publicKey);
        vi.stubEnv('WEB_PUSH_VAPID_PRIVATE_KEY', vapid.privateKey);
        vi.stubEnv('WEB_PUSH_VAPID_SUBJECT', 'mailto:admin@notebook.example');
        vi.stubEnv('NEXTAUTH_URL', 'https://notebook.example');
        vi.stubEnv('REVIEW_REMINDERS_ENABLED', 'true');
    });

    it('订阅校验、设备隔离、当前设备测试及退出时只解绑当前设备', async () => {
        expect((await put(pushSettings)).status).toBe(400);
        const crossOrigin = await REGISTER_DEVICE(new Request('https://notebook.example/api/reminders/devices', {
            method: 'POST', headers: { origin: 'https://elsewhere.example', 'sec-fetch-site': 'same-site' },
        }));
        expect(crossOrigin.status).toBe(403);
        for (const url of ['http://web.push.apple.com/device', 'https://web.push.apple.com.evil.example/device', 'https://web.push.apple.com:8080/device']) {
            expect((await register(url)).status).toBe(400);
        }
        const registration = await register(endpoint('iphone'));
        const { id: iphone } = await registration.json();
        expect(registration.headers.get('set-cookie')).toContain(`${WEB_PUSH_DEVICE_COOKIE}=${iphone}`);
        const { id: ipad } = await add('ipad');
        expect(await add('ipad')).toEqual({ id: ipad });
        const list = await (await LIST_DEVICES()).json();
        expect(list).toMatchObject({ publicKey: vapid.publicKey, devices: expect.arrayContaining([{ id: iphone, createdAt: expect.any(String), needsRenewal: false }]) });
        expect(JSON.stringify(list)).not.toContain(endpoint('iphone'));
        expect(JSON.stringify(list)).not.toContain(deviceKeys.auth);
        expect((await test(ipad, iphone)).status).toBe(400);
        expect(await (await test(iphone)).json()).toEqual({ result: 'accepted' });
        expect((await test(iphone)).status).toBe(400);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(new URL(endpoint('iphone')), expect.objectContaining({
            method: 'POST', redirect: 'error', headers: expect.objectContaining({
                Authorization: expect.stringContaining(vapid.publicKey), 'Content-Encoding': 'aes128gcm', TTL: 120,
            }),
        }));
        expect((await db.user.findUniqueOrThrow({ where: { id: 'u' } })).reminderAttempts).toBe(0);
        await db.user.create({ data: { id: 'v', email: 'other@example.com', password: 'test-only' } });
        mocks.email = 'other@example.com';
        expect((await register(endpoint('iphone'))).status).toBe(400);
        expect((await test(iphone)).status).toBe(400);
        const remove = (id: string) => REMOVE_DEVICE(new Request(`https://notebook.example/api/reminders/devices?id=${id}`, { method: 'DELETE' }));
        await remove(ipad);
        expect(await db.webPushSubscription.count()).toBe(2);
        mocks.deviceCookie = iphone;
        await authOptions.events?.signOut?.({ token: { id: 'u' }, session: { expires: '', user: { id: 'u', role: 'user' } } });
        expect(await db.webPushSubscription.findMany({ select: { id: true, userId: true } })).toEqual([{ id: ipad, userId: 'u' }]);
        expect(await add('iphone')).toEqual({ id: iphone });
        expect((await db.webPushSubscription.findUnique({ where: { id: iphone } }))?.userId).toBe('v');
        mocks.email = 'reminder@example.com';
        await remove(ipad);
        expect(await db.webPushSubscription.count()).toBe(1);
    });

    it('到点有题才推送，遇到暂时失败只重试对应设备并清理过期订阅', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
        const { id: iphone } = await add('iphone');
        const { id: ipad } = await add('ipad');
        const { id: expired } = await add('expired');
        await enableAndSeed();
        expect((await put(pushSettings)).status).toBe(200);
        await runReminders(new Date('2026-11-05T00:59:00Z'));
        expect(fetch).not.toHaveBeenCalled();
        let ipadAttempts = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: URL) => new Response(null, {
            status: url.pathname === '/expired' ? 410 : url.pathname === '/ipad' && ipadAttempts++ === 0 ? 503 : 201,
        })));
        await Promise.all([runReminders(now), runReminders(now)]);
        expect(fetch).toHaveBeenCalledTimes(3);
        expect(await db.webPushSubscription.findUnique({ where: { id: expired } })).toBeNull();
        expect(await db.webPushSubscription.findUnique({ where: { id: iphone } })).toMatchObject({ deliveryStatus: 'accepted' });
        expect(await db.webPushSubscription.findUnique({ where: { id: ipad } })).toMatchObject({ deliveryStatus: 'retry' });
        await runReminders(new Date(now.getTime() + 31 * 60_000));
        await runReminders(new Date(now.getTime() + 62 * 60_000));
        expect(vi.mocked(fetch).mock.calls.map(([url]) => (url as URL).pathname).sort()).toEqual(['/expired', '/ipad', '/ipad', '/iphone']);
        expect(await db.user.findUniqueOrThrow({ where: { id: 'u' } })).toMatchObject({ reminderCompletedDay: '2026-11-05', reminderAttempts: 2, reminderLastResult: 'accepted' });
    });

    it('无到期题时跳过，关闭设备通知后禁止新订阅和测试', async () => {
        const { id } = await add('iphone');
        expect((await put(pushSettings)).status).toBe(200);
        await runReminders(now);
        expect(await db.user.findUniqueOrThrow({ where: { id: 'u' } })).toMatchObject({ reminderLastResult: 'no_due' });
        vi.stubEnv('WEB_PUSH_ENABLED', 'false');
        expect((await register(endpoint('ipad'))).status).toBe(400);
        expect((await test(id)).status).toBe(400);
        expect(fetch).not.toHaveBeenCalled();
    });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await db?.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
async function enableAndSeed(id = 'u') {
    await db.user.update({ where: { id }, data: settings });
    const subject = await db.subject.create({ data: { name: '数学', userId: id } });
    await db.errorItem.create({ data: { userId: id, subjectId: subject.id, originalImageUrl: '', createdAt: new Date('2026-10-01') } });
}
describe('提醒设置接口与调度持久化', () => {
    it('迁移默认关闭，设置接口保存后只回显末四位，留空保留凭据', async () => {
        expect(await (await GET()).json()).toMatchObject({ reminderEnabled: false, reminderTime: '09:00', reminderCredential: null });
        const response = await put(settings); expect(response.status).toBe(200);
        const json = await response.json(); expect(json.reminderCredential).toBe('••••-key'); expect(JSON.stringify(json)).not.toContain(settings.reminderCredential);
        const { reminderCredential: _credential, ...unchanged } = settings;
        expect((await put({ ...unchanged, reminderTime: '10:00' })).status).toBe(200);
        expect((await db.user.findUniqueOrThrow({ where: { id: 'u' } })).reminderCredential).toBe(settings.reminderCredential);
        expect((await put({ ...unchanged, reminderChannel: 'pushplus' })).status).toBe(400);
    });
    it('校验时间、渠道、HTTPS 与管理员自定义开关', async () => {
        for (const value of [{ ...settings, reminderTime: '25:00' }, { ...settings, reminderChannel: 'bad' }, { ...settings, reminderCredential: 'https://evil.example/key' }, { ...settings, reminderChannel: 'custom', reminderCredential: 'https://hook.example/send' }]) expect((await put(value)).status).toBe(400);
        mocks.policy.allowCustomReminders = true;
        expect((await put({ ...settings, reminderChannel: 'custom', reminderCredential: 'https://hook.example/send' })).status).toBe(200);
        expect((await put({ ...settings, reminderChannel: 'custom', reminderCredential: 'http://hook.example/send' })).status).toBe(400);
    });
    it('测试不依赖到期题目，失败结果可见，测试有冷却且不消耗自动次数', async () => {
        await put(settings);
        expect(await (await TEST()).json()).toMatchObject({ reminderLastResult: 'accepted' });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect((await db.user.findUniqueOrThrow({ where: { id: 'u' } })).reminderAttempts).toBe(0);
        expect((await TEST()).status).toBe(400);
        await db.user.update({ where: { id: 'u' }, data: { reminderLeaseUntil: null } });
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 400 })));
        expect(await (await TEST()).json()).toMatchObject({ reminderLastResult: 'failed' });
        expect(JSON.stringify(mocks.info.mock.calls)).not.toContain(settings.reminderCredential);
    });
    it('同日多次检查、并发检查与修改时间不重复发送，重启状态仍有效', async () => {
        await enableAndSeed();
        await Promise.all([runReminders(now), runReminders(now)]);
        expect(fetch).toHaveBeenCalledTimes(1);
        await put({ ...settings, reminderTime: '11:00' });
        await runReminders(new Date('2026-11-05T07:00:00Z'));
        expect(fetch).toHaveBeenCalledTimes(1);
        const saved = await db.user.findUniqueOrThrow({ where: { id: 'u' } });
        expect(saved).toMatchObject({ reminderCompletedDay: '2026-11-05', reminderAttempts: 1, reminderLastResult: 'accepted' });
        expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({ body: '今天要复习 1 道错题（数学 1），约 4 分钟' });
        await runReminders(new Date('2026-11-06T07:00:00Z')); expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('失败当天最多重试两次，失败用户不影响其他用户', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
        await enableAndSeed();
        await db.user.create({ data: { id: 'v', email: 'other@example.com', password: 'test-only' } }); await enableAndSeed('v');
        vi.stubGlobal('fetch', vi.fn(async (url: URL) => Response.json({ code: url.pathname.includes('other-key') ? 200 : 400 })));
        await db.user.update({ where: { id: 'v' }, data: { reminderCredential: 'other-key' } });
        await runReminders(now);
        await runReminders(new Date(now.getTime() + 29 * 60_000));
        expect(fetch).toHaveBeenCalledTimes(2);
        await runReminders(new Date(now.getTime() + 30 * 60_000));
        expect(fetch).toHaveBeenCalledTimes(3);
        await runReminders(new Date(now.getTime() + 60 * 60_000));
        await runReminders(new Date(now.getTime() + 90 * 60_000));
        expect(fetch).toHaveBeenCalledTimes(4);
        expect(await db.user.findUniqueOrThrow({ where: { id: 'u' } })).toMatchObject({ reminderAttempts: 3, reminderLastResult: 'failed' });
        expect(await db.user.findUniqueOrThrow({ where: { id: 'v' } })).toMatchObject({ reminderAttempts: 1, reminderLastResult: 'accepted' });
    });
    it('无到期题、禁用账户、全局关闭均不发送；接口不能跨用户读写', async () => {
        await put(settings); await runReminders(now); expect(fetch).not.toHaveBeenCalled();
        expect(await db.user.findUniqueOrThrow({ where: { id: 'u' } })).toMatchObject({ reminderLastResult: 'no_due' });
        await enableAndSeed(); await db.user.update({ where: { id: 'u' }, data: { isActive: false } });
        await runReminders(new Date('2026-11-06T04:00:00Z')); expect(fetch).not.toHaveBeenCalled(); expect((await TEST()).status).toBe(403);
        await db.user.update({ where: { id: 'u' }, data: { isActive: true } });
        vi.stubEnv('REVIEW_REMINDERS_ENABLED', 'false'); await runReminders(new Date('2026-11-06T04:00:00Z'));
        expect(fetch).not.toHaveBeenCalled(); expect((await TEST()).status).toBe(400);
        await db.user.create({ data: { id: 'v', email: 'other@example.com', password: 'test-only' } }); mocks.email = 'other@example.com';
        expect(await (await GET()).json()).toMatchObject({ reminderCredential: null, reminderEnabled: false });
    });
});
