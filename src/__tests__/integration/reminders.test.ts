// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    database: undefined as PrismaClient | undefined,
    email: 'reminder@example.com', role: 'user', policy: { allowCustomReminders: false, allowPrivateReminders: false },
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.database; } }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: mocks.email, role: mocks.role } }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => mocks.policy, getAppTimeZone: () => 'Asia/Shanghai' }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: mocks.info, warn: mocks.warn, error: mocks.error }) }));
vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '8.8.8.8', family: 4 }] }));
vi.mock('undici', async (importOriginal) => ({ ...await importOriginal<typeof import('undici')>(), fetch: (...args: Parameters<typeof fetch>) => fetch(...args) }));
import { GET, PUT } from '@/app/api/reminders/route';
import { POST as TEST } from '@/app/api/reminders/test/route';
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
    mocks.email = 'reminder@example.com'; mocks.role = 'user'; mocks.policy = { allowCustomReminders: false, allowPrivateReminders: false };
    await db.user.deleteMany();
    await db.user.create({ data: { id: 'u', email: mocks.email, password: 'test-only' } });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 200 })));
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
        expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({ body: '今天有 1 道错题待复习（数学 1）' });
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
