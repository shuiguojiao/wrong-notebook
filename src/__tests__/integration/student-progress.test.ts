import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_VERSION } from '@/lib/backup/format';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), leaveEntries: vi.fn(), user: vi.fn(), session: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { rewardEntry: { findMany: mocks.leaveEntries }, errorItem: { findMany: mocks.findMany }, user: { findUnique: mocks.user } } }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));

import { GET } from '@/app/api/student-progress/route';

const row = (id: string, tagSet = 'default') => ({ id, subjectId: 'math', subject: { name: '数学', subjectKey: 'math' }, tags: [{ name: '方程', tagSet }], masteryProbability: null, masteryEvaluatedAt: null, practiceRecords: [] });

beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ user: { email: 'student@example.com' } });
    mocks.user.mockResolvedValue({ id: 'student', masteryThreshold: 50 });
    mocks.findMany.mockResolvedValue([]);
    mocks.leaveEntries.mockResolvedValue([]);
});

describe('学生进度只读接口', () => {
    it('未登录不能读数据，其他请求参数不改变当前用户范围', async () => {
        mocks.session.mockResolvedValueOnce(null);
        expect((await GET(new Request('http://localhost/api/student-progress'))).status).toBe(401);
        expect(mocks.findMany).not.toHaveBeenCalled();
        const response = await GET(new Request('http://localhost/api/student-progress?userId=other&limit=10'));
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        const query = mocks.findMany.mock.calls[0][0];
        expect(query.where).toEqual({ userId: 'student' });
        expect(query.select.practiceRecords.where).toEqual({ userId: 'student' });
        expect(query.take).toBeUndefined();
        expect(query.select.questionText).toBeUndefined();
        expect(mocks.leaveEntries).toHaveBeenCalledWith({ where: { userId: 'student', type: 'leave_use' }, select: { day: true } });
        expect(await response.json()).toMatchObject({ leaveDays: [] });
    });
    it('全集、混合体系和用户阈值同源推算，撤销与删题后重新读取', async () => {
        const r = { id: 'r', result: 'correct', source: 'review', createdAt: new Date() };
        const earned = { ...row('q'), masteryProbability: 0.6, masteryEvaluatedAt: new Date(), practiceRecords: [r] };
        mocks.findMany.mockResolvedValue([earned, row('q2', 'cnm')]);
        let data = await (await GET()).json();
        expect(data.stickers.map((sticker: { state: string }) => sticker.state).sort()).toEqual(['earned', 'missing']);
        mocks.user.mockResolvedValue({ id: 'student', masteryThreshold: 80 });
        data = await (await GET()).json();
        expect(data.earned).toBe(0);
        mocks.findMany.mockResolvedValue([row('q')]);
        data = await (await GET()).json();
        expect(data).toMatchObject({ earned: 0, streak: 0 });
        mocks.findMany.mockResolvedValue([]);
        expect((await (await GET()).json()).stickers).toEqual([]);
    });
    it('数据库失败返回错误，不能冒充空数据', async () => {
        mocks.findMany.mockRejectedValue(new Error('只读查询失败'));
        expect((await GET()).status).toBe(500);
    });
    it('R1a 数据模型与备份版本、格式基线保持一致', () => {
        expect(BACKUP_VERSION).toBe(21);
        expect(createHash('sha256').update(readFileSync('prisma/schema.prisma')).digest('hex')).toBe('86f2f9ce963aba108858a85e5411ae650fd0151c5d94008b1a94982315becba5');
        expect(createHash('sha256').update(readFileSync('src/lib/backup/format.ts')).digest('hex')).toBe('f537f11b3529e7d2385608071510ca9a0f8da29583b63bd1a9a9a90146a7895b');
    });
});
