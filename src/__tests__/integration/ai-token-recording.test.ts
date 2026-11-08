// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ prisma: undefined as PrismaClient | undefined }));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.prisma; } }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => ({ aiDailyLimit: 0 }), getAppTimeZone: () => 'Asia/Shanghai' }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
import { BaseAIProvider } from '@/lib/ai/base-provider';
import type { CompletionRequest } from '@/lib/ai/base-provider';
import { captureAiUsage, withAiUsageScope } from '@/lib/ai-usage-context';
import { consumeAiQuota } from '@/lib/ai-quota';

class TestProvider extends BaseAIProvider {
    protected providerName = 'OpenAI';
    protected async complete(request: CompletionRequest) {
        await this.reportCompletion({ model: 'actual-model', usage: { prompt_tokens: 10, completion_tokens: 5 } }, 'configured-model', request.task);
        return JSON.stringify({ gradeSemester: '七年级上学期' });
    }
}

const directory = mkdtempSync(join(tmpdir(), 'ai-usage-'));
const url = `file:${join(directory, 'test.db')}`;
const user = { id: 'u', role: 'user', aiDataConsentAt: new Date() };
beforeAll(async () => {
    // 在旧结构插入历史记录后执行新迁移，验证已有数据兼容性。
    mocks.prisma = new PrismaClient({ datasources: { db: { url } } });
    const migrations = readdirSync(resolve('prisma/migrations')).filter(name => name !== 'migration_lock.toml').sort();
    const legacyMigrations = migrations.filter(name => name < '20261105092158_ai_usage_tokens');
    for (const name of legacyMigrations) {
        const sql = readFileSync(resolve('prisma/migrations', name, 'migration.sql'), 'utf8');
        execFileSync('python3', ['-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', join(directory, 'test.db')], { input: sql });
    }
    // 旧库用参数化 SQL 插入，避免新客户端隐式写入尚未迁移的用户字段。
    await mocks.prisma.$executeRaw`INSERT INTO User (id,email,password,updatedAt,aiDataConsentAt) VALUES (${user.id},${'usage@example.com'},${'unused'},${new Date()},${user.aiDataConsentAt})`;
    await mocks.prisma.$executeRaw`INSERT INTO AiUsage (id,userId,kind,createdAt) VALUES ('old','u','analyze',0)`;
    for (const name of legacyMigrations) {
        await mocks.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS _prisma_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, finished_at DATETIME, migration_name TEXT NOT NULL, logs TEXT, rolled_back_at DATETIME, started_at DATETIME NOT NULL DEFAULT current_timestamp, applied_steps_count INTEGER UNSIGNED NOT NULL DEFAULT 0)`);
        const { createHash, randomUUID } = await import('node:crypto');
        const checksum = createHash('sha256').update(readFileSync(resolve('prisma/migrations', name, 'migration.sql'))).digest('hex');
        await mocks.prisma.$executeRaw`INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,applied_steps_count) VALUES (${randomUUID()},${checksum},${new Date()},${name},1)`;
    }
    execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}, 60000);
afterAll(async () => { await mocks.prisma?.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe('操作与 token 回填', () => {
    it('历史记录保留且新增字段为空', async () => {
        expect(await mocks.prisma!.aiUsage.findUnique({ where: { id: 'old' } })).toMatchObject({ inputTokens: null, outputTokens: null, provider: null });
    });
    it('多次模型调用累加同一行；并发操作和后台快照互不串账', async () => {
        const provider = new TestProvider();
        let first: () => Promise<void> = async () => {};
        await withAiUsageScope(async () => {
            expect(await consumeAiQuota(user, 'analyze')).toBeNull();
            first = captureAiUsage(async () => { await Promise.all([provider.recognizeGrade('题目'), provider.recognizeGrade('题目')]); });
            expect(await consumeAiQuota(user, 'retag')).toBeNull();
            await provider.recognizeGrade('另一个操作');
        });
        await first();
        const rows = await mocks.prisma!.aiUsage.findMany({ where: { id: { not: 'old' } } });
        expect(rows).toHaveLength(2);
        expect(rows.find(row => row.kind === 'analyze')).toMatchObject({ inputTokens: 20, outputTokens: 10, model: 'actual-model', provider: 'openai' });
        expect(rows.find(row => row.kind === 'retag')).toMatchObject({ inputTokens: 10, outputTokens: 5 });
        await provider.recognizeGrade('未关联操作');
        expect(await mocks.prisma!.aiUsage.count()).toBe(3);
    });
});
