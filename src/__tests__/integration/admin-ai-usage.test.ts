// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    prisma: undefined as PrismaClient | undefined,
    session: null as { user: { email: string; role: string }; expires: string } | null,
    config: { aiProvider: 'openai', aiModelPrices: [{ provider: 'openai', model: 'actual', inputPerMillion: 2, outputPerMillion: 8, currency: 'USD' }] },
    update: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.prisma; } }));
vi.mock('next-auth', () => ({ getServerSession: () => mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => mocks.config, getAppTimeZone: () => 'Asia/Shanghai', updateAppConfig: mocks.update }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
import { GET } from '@/app/api/admin/ai-usage/route';
import { POST as SETTINGS } from '@/app/api/settings/route';

const directory = mkdtempSync(join(tmpdir(), 'admin-ai-usage-'));
beforeAll(async () => {
    const url = `file:${join(directory, 'test.db')}`;
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    mocks.prisma = new PrismaClient({ datasources: { db: { url } } });
    await mocks.prisma.user.createMany({ data: [{ id: 'admin', email: 'admin@example.com', password: 'unused', role: 'admin' }, { id: 'friend', email: 'friend@example.com', password: 'unused' }] });
}, 120000);
afterAll(async () => { await mocks.prisma?.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
beforeEach(async () => { await mocks.prisma!.aiUsage.deleteMany(); mocks.session = { user: { email: 'admin@example.com', role: 'admin' }, expires: '2099-01-01' }; });
afterEach(() => vi.useRealTimers());

describe('管理用量与单价接口', () => {
    it('未登录返回 401，普通用户即使旧会话声称管理员也返回 403', async () => {
        mocks.session = null; expect((await GET()).status).toBe(401);
        mocks.session = { user: { email: 'friend@example.com', role: 'admin' }, expires: '2099-01-01' };
        expect((await GET()).status).toBe(403);
    });
    it('按应用时区和用户统计本月/上月，保留零用量用户及未知历史记录', async () => {
        vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-05T00:00:00Z'));
        await mocks.prisma!.aiUsage.createMany({ data: [
            { userId: 'friend', kind: 'analyze', createdAt: new Date('2026-10-31T16:00:00Z'), provider: 'openai', model: 'actual', inputTokens: 1_000_000, outputTokens: 250_000 },
            { userId: 'friend', kind: 'retag', createdAt: new Date('2026-10-31T15:59:59Z') },
            { userId: 'friend', kind: 'exam', createdAt: new Date('2026-09-30T15:59:59Z') },
        ] });
        const response = await GET(); expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.timeZone).toBe('Asia/Shanghai');
        expect(data.months[0]).toMatchObject({ month: '2026-11', total: { calls: 1, inputTokens: 1_000_000, outputTokens: 250_000, costs: { USD: 4 }, kinds: { analyze: 1 } } });
        expect(data.months[0].users.find((user: { id: string }) => user.id === 'admin').stats.calls).toBe(0);
        expect(data.months[1]).toMatchObject({ month: '2026-10', total: { calls: 1, unknownActions: 1, costs: {} } });
    });
    it('单价配置拒绝负数、重复和非法币种，规范化合法值', async () => {
        const post = (aiModelPrices: unknown) => SETTINGS(new Request('http://localhost/api/settings', { method: 'POST', body: JSON.stringify({ aiModelPrices }) }));
        const price = mocks.config.aiModelPrices[0];
        for (const rows of [[{ ...price, inputPerMillion: -1 }], [price, price], [{ ...price, currency: 'not-a-currency' }], [{}]]) expect((await post(rows)).status).toBe(400);
        mocks.update.mockReturnValue({});
        expect((await post([{ ...price, currency: 'usd' }])).status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith({ aiModelPrices: [price] });
        mocks.session = { user: { email: 'friend@example.com', role: 'user' }, expires: '2099-01-01' };
        expect((await post([])).status).toBe(403);
    });
});
