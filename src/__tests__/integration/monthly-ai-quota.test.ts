// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    prisma: undefined as PrismaClient | undefined,
    config: { aiProvider: 'openai', aiDailyLimit: 0, aiMonthlyTokenLimit: 20 },
    session: { user: { email: 'friend@example.com', role: 'user' }, expires: '2099-01-01' },
    update: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.prisma; } }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => mocks.config, getAppTimeZone: () => 'Asia/Shanghai', updateAppConfig: mocks.update }));
vi.mock('next-auth', () => ({ getServerSession: () => mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }));
import { consumeAiQuota, quotaRejectionCode } from '@/lib/ai-quota';
import { setAiUsageId, withAiUsageScope } from '@/lib/ai-usage-context';
import { getMonthlyAiUsage } from '@/lib/ai-monthly-quota';
import { BaseAIProvider } from '@/lib/ai/base-provider';
import type { CompletionRequest } from '@/lib/ai/base-provider';
import { internalError } from '@/lib/api-errors';
import { GET as MY_USAGE } from '@/app/api/ai-usage/route';
import { POST as SETTINGS } from '@/app/api/settings/route';

class TestProvider extends BaseAIProvider {
    protected providerName = 'OpenAI';
    calls = 0;
    protected async complete(request: CompletionRequest) {
        this.calls += 1;
        await this.reportCompletion({ model: 'test', usage: { prompt_tokens: 10, completion_tokens: 5 } }, 'test', request.task);
        return JSON.stringify({ gradeSemester: null });
    }
}
const directory = mkdtempSync(join(tmpdir(), 'monthly-ai-quota-'));
const user = { id: 'friend', role: 'user', aiDataConsentAt: new Date() };
beforeAll(async () => {
    const url = `file:${join(directory, 'test.db')}`;
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    mocks.prisma = new PrismaClient({ datasources: { db: { url } } });
    await mocks.prisma.user.createMany({ data: [{ id: user.id, email: 'friend@example.com', password: 'unused', aiDataConsentAt: user.aiDataConsentAt }, { id: 'admin', email: 'admin@example.com', password: 'unused', role: 'admin', aiDataConsentAt: user.aiDataConsentAt }] });
}, 120000);
afterAll(async () => { await mocks.prisma?.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
beforeEach(async () => {
    await mocks.prisma!.aiUsage.deleteMany();
    mocks.config.aiMonthlyTokenLimit = 20; mocks.config.aiDailyLimit = 0;
    mocks.session = { user: { email: 'friend@example.com', role: 'user' }, expires: '2099-01-01' };
});
afterEach(() => vi.useRealTimers());

describe('每月上限与个人用量（真实 SQLite）', () => {
    it('最后一次可略超，后续操作返回 429，后台保留月上限原因', async () => {
        const provider = new TestProvider();
        for (let i = 0; i < 2; i++) await withAiUsageScope(async () => {
            expect(await consumeAiQuota(user, 'analyze')).toBeNull(); await provider.recognizeGrade('题目');
        });
        const rejected = await withAiUsageScope(() => consumeAiQuota(user, 'split'));
        expect(rejected?.status).toBe(429);
        expect(await rejected?.clone().json()).toMatchObject({ code: 'AI_MONTHLY_TOKEN_LIMIT_EXCEEDED', details: { limit: 20 } });
        expect(await quotaRejectionCode(rejected!)).toBe('AI_MONTHLY_TOKEN_LIMIT_EXCEEDED');
        expect(await getMonthlyAiUsage(user.id)).toMatchObject({ calls: 2, totalTokens: 30 });
        expect(provider.calls).toBe(2);
    });
    it('一次操作的多次模型调用在回填后复查，已排队操作也不能绕过月限', async () => {
        const provider = new TestProvider();
        await withAiUsageScope(async () => {
            expect(await consumeAiQuota(user, 'exam')).toBeNull();
            const results = await Promise.allSettled([provider.recognizeGrade('1'), provider.recognizeGrade('2'), provider.recognizeGrade('3')]);
            expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2);
            expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { message: 'AI_MONTHLY_TOKEN_LIMIT_EXCEEDED' } });
        });
        expect(provider.calls).toBe(2);
        expect(await getMonthlyAiUsage(user.id)).toMatchObject({ calls: 1, totalTokens: 30 });
        const response = internalError('AI_MONTHLY_TOKEN_LIMIT_EXCEEDED');
        expect(response.status).toBe(429);
        expect(await response.json()).toMatchObject({ code: 'AI_MONTHLY_TOKEN_LIMIT_EXCEEDED' });
    });
    it('多操作同时排队也只允许最后一次跨越上限', async () => {
        const provider = new TestProvider();
        let ready = 0;
        let release: () => void = () => {};
        const gate = new Promise<void>(resolve => { release = resolve; });
        const results = await Promise.allSettled(Array.from({ length: 3 }, () => withAiUsageScope(async () => {
            expect(await consumeAiQuota(user, 'analyze')).toBeNull();
            if (++ready === 3) release();
            await gate;
            await provider.recognizeGrade('已排队题目');
        })));
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2);
        expect(provider.calls).toBe(2);
        expect((await getMonthlyAiUsage(user.id)).totalTokens).toBe(30);
    });
    it('跨月继续执行的操作按开始月份检查，不能利用换月绕过原月限', async () => {
        const startedAt = new Date('2000-01-01');
        const row = await mocks.prisma!.aiUsage.create({ data: { userId: user.id, kind: 'exam', inputTokens: 30, outputTokens: 0, createdAt: startedAt } });
        expect((await getMonthlyAiUsage(user.id)).totalTokens).toBe(0);
        const provider = new TestProvider();
        await withAiUsageScope(async () => {
            setAiUsageId(row.id, { userId: user.id, admin: false, startedAt });
            await expect(provider.recognizeGrade('旧操作')).rejects.toThrow('AI_MONTHLY_TOKEN_LIMIT_EXCEEDED');
        });
        expect(provider.calls).toBe(0);
    });

    it('管理员豁免、0 不限；上月记录不计本月', async () => {
        await mocks.prisma!.aiUsage.create({ data: { userId: user.id, kind: 'exam', inputTokens: 999, outputTokens: 999, createdAt: new Date('2000-01-01') } });
        expect((await getMonthlyAiUsage(user.id)).totalTokens).toBe(0);
        const provider = new TestProvider();
        for (let i = 0; i < 3; i++) await withAiUsageScope(async () => {
            const admin = { ...user, id: 'admin', role: 'admin' };
            expect(await consumeAiQuota(admin, 'analyze')).toBeNull(); await provider.recognizeGrade('题目');
        });
        mocks.config.aiMonthlyTokenLimit = 0;
        await mocks.prisma!.aiUsage.create({ data: { userId: user.id, kind: 'exam', inputTokens: 999, outputTokens: 999 } });
        expect(await withAiUsageScope(() => consumeAiQuota(user, 'analyze'))).toBeNull();
    });
    it('个人接口只返回本人统计和有效上限，不泄露其他用户用量', async () => {
        await mocks.prisma!.aiUsage.createMany({ data: [{ userId: user.id, kind: 'analyze', inputTokens: 12, outputTokens: 3 }, { userId: 'admin', kind: 'exam', inputTokens: 999, outputTokens: 999 }] });
        mocks.config.aiDailyLimit = 3;
        const response = await MY_USAGE(); expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toMatchObject({ calls: 1, totalTokens: 15, todayCalls: 1, dailyLimit: 3, monthlyTokenLimit: 20, admin: false });
        expect(data).not.toHaveProperty('users'); expect(data).not.toHaveProperty('aiModelPrices');
        mocks.session = { user: { email: 'admin@example.com', role: 'admin' }, expires: '2099-01-01' };
        expect(await (await MY_USAGE()).json()).toMatchObject({ admin: true });
    });
    it('月限启用时统计失败会阻止调用', async () => {
        vi.spyOn(mocks.prisma!.aiUsage, 'aggregate').mockRejectedValueOnce(new Error('读取失败'));
        const rejected = await withAiUsageScope(() => consumeAiQuota(user, 'analyze'));
        expect(rejected?.status).toBe(500);
        expect(await quotaRejectionCode(rejected!)).toBe('INTERNAL_ERROR');
        expect(await mocks.prisma!.aiUsage.count()).toBe(0);
    });
    it('管理员可保存非负整数上限，非法值被拒绝', async () => {
        mocks.session = { user: { email: 'admin@example.com', role: 'admin' }, expires: '2099-01-01' };
        const post = (aiMonthlyTokenLimit: unknown) => SETTINGS(new Request('http://localhost/api/settings', { method: 'POST', body: JSON.stringify({ aiMonthlyTokenLimit }) }));
        for (const value of [-1, 1.5, '20', null, Number.MAX_SAFE_INTEGER + 1]) expect((await post(value)).status).toBe(400);
        mocks.update.mockReturnValue({}); expect((await post(50)).status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith({ aiMonthlyTokenLimit: 50 });
    });
});
