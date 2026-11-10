import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_VERSION } from '@/lib/backup/format';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), user: vi.fn(), session: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { errorItem: { findMany: mocks.findMany }, user: { findUnique: mocks.user } } }));
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
    it('E5 数据模型与备份版本、格式基线保持一致', () => {
        expect(BACKUP_VERSION).toBe(18);
        expect(createHash('sha256').update(readFileSync('prisma/schema.prisma')).digest('hex')).toBe('85050c0186c62965c2e8d9ec3d3b0018b7e059bf91e04035908216d8b930dcd9');
        expect(createHash('sha256').update(readFileSync('src/lib/backup/format.ts')).digest('hex')).toBe('a7bb280a23480b21150c80e9e8a59fda875942dd8c8bbc4bf59007c1e6501f1a');
    });
});
