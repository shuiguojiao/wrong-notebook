// @vitest-environment node
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createAgentTestDatabase } from '../helpers/agent-database';

const mocks = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: 'backup-scale@example.com' }, expires: '2099-01-01' }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));
vi.mock('@/lib/tts/speech-cache', () => ({ exportSpeeches: async () => [] }));
import { GET } from '@/app/api/export/route';

let database: ReturnType<typeof createAgentTestDatabase>;
beforeAll(async () => {
    database = createAgentTestDatabase();
    const db = database.client;
    mocks.db = db;
    await db.user.create({ data: { id: 'scale', email: 'backup-scale@example.com', password: 'test-only' } });
    await db.user.create({ data: { id: 'other', email: 'other@example.com', password: 'test-only' } });
    for (let start = 0; start < 1200; start += 300) {
        const ids = Array.from({ length: 300 }, (_, i) => `batch-${start + i}`);
        await db.importBatch.createMany({ data: ids.map(id => ({ id, userId: 'scale', source: 'text', splitter: 'local', status: 'draft' })) });
        await db.importTask.createMany({ data: ids.map(batchId => ({ id: `task-${batchId}`, userId: 'scale', mode: 'review', imageData: '', status: 'saved', batchId })) });
    }
    await db.importBatch.create({ data: { id: 'done', userId: 'scale', source: 'text', splitter: 'local', status: 'started' } });
    await db.importTask.createMany({ data: [
        { id: 'standalone-saved', userId: 'scale', mode: 'review', imageData: '', status: 'saved' },
        { id: 'completed-batch-task', userId: 'scale', mode: 'review', imageData: '', status: 'saved', batchId: 'done' },
        { id: 'failed', userId: 'scale', mode: 'review', imageData: '', status: 'failed' },
        { id: 'foreign', userId: 'other', mode: 'review', imageData: '', status: 'failed' },
    ] });
}, 120000);
afterAll(async () => { await database?.dispose(); });

it('1200 个未完成批次仍完整导出，保持第 18 版任务范围与用户隔离', async () => {
    const response = await GET(new Request('http://localhost/api/export'));
    expect(response.status).toBe(200);
    const backup = await response.json();
    expect(backup.version).toBe(21);
    expect(backup.importBatches).toHaveLength(1200);
    expect(backup.importTasks).toHaveLength(1201);
    const ids = new Set(backup.importTasks.map((task: { id: string }) => task.id));
    expect(ids.has('task-batch-1199')).toBe(true);
    expect(ids.has('failed')).toBe(true);
    expect(ids.has('standalone-saved')).toBe(false);
    expect(ids.has('completed-batch-task')).toBe(false);
    expect(ids.has('foreign')).toBe(false);
});
