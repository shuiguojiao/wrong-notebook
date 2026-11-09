// @vitest-environment node
import { unlink } from 'node:fs/promises';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAgentTestDatabase } from '@/__tests__/helpers/agent-database';

const state = vi.hoisted(() => ({ client: undefined as unknown as PrismaClient }));
vi.mock('@/lib/prisma', () => ({ prisma: new Proxy({}, {
    get(_target, key) {
        const value = Reflect.get(state.client, key);
        return typeof value === 'function' ? value.bind(state.client) : value;
    },
}) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { email: 'reader@example.com' } })) }));
import { getServerSession } from 'next-auth';
import { GET } from '@/app/api/error-items/[id]/source/route';
import { GET as image } from '@/app/api/error-items/[id]/image/route';
import { GET as list } from '@/app/api/error-items/list/route';
import { localImagePath, storeImage } from '@/lib/image-storage';

let database: ReturnType<typeof createAgentTestDatabase>;
const bytes = Buffer.from('出处页测试图片');
const context = (id = 'question') => ({ params: Promise.resolve({ id }) });
const get = (id = 'question') => GET(new Request('http://localhost/api/error-items/source'), context(id));
const getImage = (pageId: string, id = 'question') => image(new Request(`http://localhost/api/error-items/${id}/image?sourcePage=${pageId}`), context(id));
beforeAll(async () => {
    database = createAgentTestDatabase(); state.client = database.client;
    await state.client.user.createMany({ data: [
        { id: 'reader', email: 'reader@example.com', password: 'test-only' },
        { id: 'other', email: 'other@example.com', password: 'test-only' },
    ] });
    const reference = await storeImage(`data:image/png;base64,${bytes.toString('base64')}`);
    await state.client.sourcePage.createMany({ data: [
        { id: 'page', userId: 'reader', sha256: 'page', imageUrl: reference, width: 800, height: 1200, fileName: '试卷.pdf', pageNumber: 7, origin: 'pdf' },
        { id: 'next', userId: 'reader', sha256: 'next', imageUrl: reference, width: 800, height: 1200, origin: 'upload' },
        { id: 'private', userId: 'other', sha256: 'private', imageUrl: reference, width: 800, height: 1200, origin: 'agent' },
    ] });
    await state.client.errorItem.createMany({ data: [
        { id: 'question', userId: 'reader', originalImageUrl: '' },
        { id: 'old', userId: 'reader', originalImageUrl: '' },
        { id: 'foreign', userId: 'other', originalImageUrl: '' },
        { id: 'cross-page', userId: 'reader', originalImageUrl: '' },
    ] });
    await state.client.questionRegion.createMany({ data: [
        { errorItemId: 'question', pageId: 'page', order: 1, x: 0.2, y: 0.6, width: 0.5, height: 0.2 },
        { errorItemId: 'question', pageId: 'page', order: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.3 },
        { errorItemId: 'foreign', pageId: 'private', order: 0, x: 0, y: 0, width: 1, height: 1 },
        { errorItemId: 'cross-page', pageId: 'page', order: 0, x: 0, y: 0.9, width: 1, height: 0.1 },
        { errorItemId: 'cross-page', pageId: 'next', order: 1, x: 0, y: 0, width: 1, height: 0.1 },
    ] });
});
afterAll(async () => { await database?.dispose(); });

describe('读取出处（隔离临时 SQLite）', () => {
    it('本人可读元信息，多区域按 order 排序，内部图片标识不外泄', async () => {
        const response = await get();
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(data.page).toMatchObject({ id: 'page', fileName: '试卷.pdf', pageNumber: 7, origin: 'pdf', width: 800, height: 1200 });
        expect(data.page.imageUrl).toMatch(/^\/api\/error-items\/question\/image\?sourcePage=page&v=\d+$/);
        expect(data.regions).toEqual([
            { order: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.3 },
            { order: 1, x: 0.2, y: 0.6, width: 0.5, height: 0.2 },
        ]);
        expect(JSON.stringify(data)).not.toMatch(/local-image:|userId|sha256/);
    });
    it('他人及不存在的题返回 404，旧题出处为空', async () => {
        expect((await get('foreign')).status).toBe(404);
        expect((await get('missing')).status).toBe(404);
        expect(await (await get('old')).json()).toEqual({ page: null, regions: [] });
    });
    it('跨页题保留首个出处并按区域顺序返回全部页', async () => {
        const data = await (await get('cross-page')).json();
        expect(data.page.id).toBe('page');
        expect(data.pages.map((entry: { page: { id: string }; regions: { order: number }[] }) => [entry.page.id, entry.regions[0].order])).toEqual([['page', 0], ['next', 1]]);
    });
    it('出处图片沿用题图的私有缓存与内容头，必须同时拥有题目及关联页', async () => {
        const response = await getImage('page');
        expect(response.status).toBe(200);
        expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
        expect(response.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
        expect(response.headers.get('Content-Type')).toBe('image/png');
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect((await getImage('private')).status).toBe(404);
        expect((await getImage('page', 'old')).status).toBe(404);
        expect((await getImage('next')).status).toBe(404);
        expect((await getImage('private', 'foreign')).status).toBe(404);
    });
    it('列表仅补充文件名，旧题保持 null，不携带出处图片数据', async () => {
        const response = await list(new Request('http://localhost/api/error-items/list'));
        const data = await response.json();
        expect(data.items.find((item: { id: string }) => item.id === 'question').sourceFileName).toBe('试卷.pdf');
        expect(data.items.find((item: { id: string }) => item.id === 'old').sourceFileName).toBeNull();
        expect(JSON.stringify(data)).not.toMatch(/questionRegions|local-image:|base64/);
    });
    it('未登录时元信息与图片都返回 401', async () => {
        vi.mocked(getServerSession).mockResolvedValueOnce(null);
        expect((await get()).status).toBe(401);
        vi.mocked(getServerSession).mockResolvedValueOnce(null);
        expect((await getImage('page')).status).toBe(401);
    });
    it('图片丢失返回 404', async () => {
        const page = await state.client.sourcePage.findUniqueOrThrow({ where: { id: 'page' } });
        await unlink(localImagePath(page.imageUrl));
        expect((await getImage('page')).status).toBe(404);
    });
});
