// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createAgentTestDatabase } from '../helpers/agent-database';

const mocks = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: 'scale@example.com' }, expires: '2099-01-01' }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));
import { GET as DUE } from '@/app/api/review/due/route';
import { GET as WEAK_TAGS } from '@/app/api/stats/weak-tags/route';

const ITEM_COUNT = 1200;
let database: ReturnType<typeof createAgentTestDatabase>;
beforeAll(async () => {
    database = createAgentTestDatabase();
    const db = database.client;
    mocks.db = db;
    const now = Date.now();
    const day = 86400000;
    await db.user.create({ data: { id: 'scale', email: 'scale@example.com', password: 'test-only' } });
    await db.subject.create({ data: { id: 'math', name: '数学', subjectKey: 'math', userId: 'scale' } });
    for (let start = 0; start < ITEM_COUNT; start += 300) {
        const ids = Array.from({ length: 300 }, (_, i) => `scale-${start + i}`);
        await db.errorItem.createMany({ data: ids.map(id => ({ id, userId: 'scale', subjectId: 'math', originalImageUrl: '', questionText: id, createdAt: new Date(now - 5 * day) })) });
        await db.practiceRecord.createMany({ data: ids.map(errorItemId => ({ userId: 'scale', errorItemId, result: 'wrong', source: 'practice', createdAt: new Date(now - 3 * day) })) });
    }
    await db.knowledgeTag.create({ data: { id: 'algebra', name: '方程', subject: 'math', tagSet: 'default', userId: 'scale' } });
    await db.errorItem.update({ where: { id: 'scale-0' }, data: { tags: { connect: { id: 'algebra' } } } });
    await db.practiceRecord.create({ data: { userId: 'scale', errorItemId: 'scale-0', result: 'wrong', source: 'duplicate_import', createdAt: new Date(now - day) } });
}, 120000);
afterAll(async () => { await database?.dispose(); });

describe('1200 道错题的真实 SQLite 查询', () => {
    it('重写后的复习队列可回填旧题并按分钟额度返回', async () => {
        const response = await DUE(new Request('http://localhost/api/review/due?format=ids'));
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.items.length).toBeGreaterThan(0);
        expect(data.estimatedMinutes).toBeLessThanOrEqual(data.dailyMinutes);
        expect(await database.client.errorItem.count({ where: { reviewSyncedAt: { not: null } } })).toBe(ITEM_COUNT);
    }, 120000);

    it('薄弱知识点排除重复导入，保留有效作答', async () => {
        const response = await WEAK_TAGS(new Request('http://localhost/api/stats/weak-tags?range=all'));
        expect(response.status).toBe(200);
        expect((await response.json()).weakTags).toEqual([expect.objectContaining({ tag: '方程', total: 1, unmastered: 1, recentAttempted: 1, recentCorrect: 0 })]);
    });
});
