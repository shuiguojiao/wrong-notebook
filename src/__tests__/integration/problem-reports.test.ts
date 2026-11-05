// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    prisma: undefined as PrismaClient | undefined,
    email: 'report@example.com',
    timeZone: 'Asia/Shanghai',
}));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.prisma; } }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { email: mocks.email, role: 'admin' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => mocks.timeZone }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

import { GET, POST } from '@/app/api/problem-reports/route';
import { GET as ADMIN_GET } from '@/app/api/admin/problem-reports/route';
import { PATCH } from '@/app/api/admin/problem-reports/[id]/route';
import { getDayRange } from '@/lib/date-time';
import { REPORT_DAILY_LIMIT } from '@/lib/problem-reports/schema';

let db: PrismaClient;
let directory: string;
const createRequest = (body: unknown = { errorItemId: 'item', category: 'analysis', description: '这一步公式推导有误' }) => new Request('http://localhost/api/problem-reports', { method: 'POST', body: JSON.stringify(body) });
const listRequest = (id = 'item') => new Request(`http://localhost/api/problem-reports?errorItemId=${id}`);
const adminRequest = (query = '') => new Request(`http://localhost/api/admin/problem-reports${query}`);
const update = (id: string, status = 'resolved', adminNote = '已修正提示词，请重新解析') => PATCH(new Request(`http://localhost/api/admin/problem-reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status, adminNote }) }), { params: Promise.resolve({ id }) });

beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'wrong-notebook-reports-'));
    const url = `file:${join(directory, 'test.db')}`;
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    db = new PrismaClient({ datasources: { db: { url } } }); mocks.prisma = db;
}, 120000);

beforeEach(async () => {
    await db.user.deleteMany();
    mocks.email = 'report@example.com'; mocks.timeZone = 'Asia/Shanghai';
    await db.user.createMany({ data: [
        { id: 'owner', email: 'report@example.com', password: 'test' },
        { id: 'other', email: 'other@example.com', password: 'test' },
        { id: 'admin', email: 'admin@example.com', password: 'test', role: 'admin' },
    ] });
    await db.subject.create({ data: { id: 'math', name: '数学', userId: 'owner' } });
    await db.errorItem.create({ data: { id: 'item', userId: 'owner', subjectId: 'math', originalImageUrl: 'data:image/png;base64,private-image', questionText: '求 $x^2=4$', answerText: '$x=2$', analysis: '错误解析', source: '期中考试', gradeSemester: '初二上' } });
});

afterAll(async () => { await db?.$disconnect(); if (directory) rmSync(directory, { recursive: true, force: true }); });

describe('问题反馈闭环（真实 SQLite）', () => {
    it('服务端建立快照，不接收伪造字段，记录实际关联模型并保持快照不变', async () => {
        const usage = await db.aiUsage.create({ data: { userId: 'owner', kind: 'analyze', provider: 'openai', model: 'actual-model' } });
        await db.importTask.create({ data: { id: 'task', userId: 'owner', mode: 'auto', status: 'saved', imageData: '', errorItemId: 'item', result: JSON.stringify({ reportAiUsageId: usage.id }) } });
        expect((await POST(createRequest({ errorItemId: 'item', category: 'analysis', description: '说明', snapshot: '{}' }))).status).toBe(400);
        const response = await POST(createRequest()); expect(response.status).toBe(201);
        const report = await response.json(); expect(report).toMatchObject({ status: 'open', adminNote: '' });
        expect(report).not.toHaveProperty('snapshot');
        const row = await db.problemReport.findUniqueOrThrow({ where: { id: report.id } });
        expect(JSON.parse(row.snapshot)).toMatchObject({ questionText: '求 $x^2=4$', subject: '数学', gradeSemester: '初二上', source: '期中考试', entryMethod: 'image', hasOriginalImage: true, aiProvider: 'openai', aiModel: 'actual-model' });
        expect(row.snapshot).not.toContain('private-image'); expect(row.snapshot).not.toContain('data:image');
        await db.errorItem.update({ where: { id: 'item' }, data: { analysis: '已修正' } });
        expect(JSON.parse((await db.problemReport.findUniqueOrThrow({ where: { id: report.id } })).snapshot).analysis).toBe('错误解析');
    });

    it('验证类别与说明长度、非法 JSON 和缺失题目', async () => {
        for (const body of [null, { errorItemId: 'item', category: 'bad', description: '说明' }, { errorItemId: 'item', category: 'text', description: '   ' }, { errorItemId: 'item', category: 'text', description: 'a'.repeat(2001) }]) expect((await POST(createRequest(body))).status).toBe(400);
        expect((await POST(new Request('http://localhost', { method: 'POST', body: '{' }))).status).toBe(400);
        expect((await POST(createRequest({ errorItemId: 'missing', category: 'text', description: '说明' }))).status).toBe(404);
        expect((await GET(new Request('http://localhost'))).status).toBe(400);
    });

    it('旧题模型未知，不使用当前配置或其他用户的调用记录', async () => {
        const usage = await db.aiUsage.create({ data: { userId: 'other', kind: 'analyze', provider: 'private', model: 'other-model' } });
        await db.importTask.create({ data: { userId: 'owner', mode: 'auto', status: 'saved', imageData: '', errorItemId: 'item', result: JSON.stringify({ reportAiUsageId: usage.id }) } });
        await POST(createRequest());
        const row = await db.problemReport.findFirstOrThrow();
        expect(JSON.parse(row.snapshot)).toMatchObject({ aiProvider: null, aiModel: null });
    });

    it('他人无法读写反馈或借题目 ID 提交，数据库角色覆盖旧会话角色', async () => {
        const report = await (await POST(createRequest())).json();
        mocks.email = 'other@example.com';
        expect(await (await GET(listRequest())).json()).toEqual([]);
        expect((await POST(createRequest())).status).toBe(404);
        expect((await update(report.id)).status).toBe(403);
        expect((await ADMIN_GET(adminRequest())).status).toBe(403);
        expect((await db.problemReport.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('open');
    });

    it('按应用时区限制每日 30 条，并发提交只能消耗剩余一个名额', async () => {
        const report = await (await POST(createRequest())).json();
        const row = await db.problemReport.findUniqueOrThrow({ where: { id: report.id } });
        const { start } = getDayRange(new Date(), mocks.timeZone);
        const { id: _id, ...data } = row;
        void _id;
        await db.problemReport.createMany({ data: Array.from({ length: REPORT_DAILY_LIMIT - 2 }, () => ({ ...data, createdAt: start })) });
        await db.problemReport.create({ data: { ...data, createdAt: new Date(start.getTime() - 1) } });
        const responses = await Promise.all([POST(createRequest()), POST(createRequest())]);
        expect(responses.map(r => r.status).sort()).toEqual([201, 429]);
        expect(Number(responses.find(r => r.status === 429)!.headers.get('Retry-After'))).toBeGreaterThan(0);
        expect((await POST(createRequest())).status).toBe(429);
    });

    it.each(['resolved', 'wontfix'])('管理员筛选、更新 %s 状态与备注，用户可读取处理结果', async status => {
        const report = await (await POST(createRequest())).json();
        mocks.email = 'admin@example.com';
        const list = await (await ADMIN_GET(adminRequest('?status=open&category=analysis'))).json();
        expect(list.total).toBe(1); expect(list.reports[0].user.email).toBe('report@example.com');
        expect(list.reports[0]).not.toHaveProperty('errorItemId'); expect(list.reports[0]).not.toHaveProperty('userId');
        expect(list.reports[0].snapshot).toMatchObject({ analysis: '错误解析', aiModel: null });
        expect((await update(report.id, status)).status).toBe(200);
        expect((await (await ADMIN_GET(adminRequest('?status=open'))).json()).total).toBe(0);
        expect((await (await ADMIN_GET(adminRequest(`?status=${status}&category=analysis`))).json()).total).toBe(1);
        expect((await (await ADMIN_GET(adminRequest('?category=formula'))).json()).total).toBe(0);
        expect((await ADMIN_GET(adminRequest('?status=bad'))).status).toBe(400);
        expect((await update(report.id, 'bad')).status).toBe(400);
        expect((await update(report.id, status, 'x'.repeat(2001))).status).toBe(400);
        expect((await update('missing')).status).toBe(404);
        mocks.email = 'report@example.com';
        expect(await (await GET(listRequest())).json()).toEqual([expect.objectContaining({ status, adminNote: '已修正提示词，请重新解析' })]);
    });

    it('管理员列表分页，删除题目保留报告，注销账号级联删除', async () => {
        const report = await (await POST(createRequest())).json();
        const { id: _id, ...row } = await db.problemReport.findUniqueOrThrow({ where: { id: report.id } }); void _id;
        await db.problemReport.createMany({ data: Array.from({ length: 20 }, () => row) });
        mocks.email = 'admin@example.com';
        expect((await (await ADMIN_GET(adminRequest())).json()).reports).toHaveLength(20);
        expect((await (await ADMIN_GET(adminRequest('?page=2'))).json()).reports).toHaveLength(1);
        await db.errorItem.delete({ where: { id: 'item' } });
        expect(await db.problemReport.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({ errorItemId: null });
        expect((await (await ADMIN_GET(adminRequest())).json()).total).toBe(21);
        await db.user.delete({ where: { id: 'owner' } });
        expect(await db.problemReport.count()).toBe(0);
    });
});
