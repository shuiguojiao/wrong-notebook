// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PracticeCalendarResponse, PracticeHistoryPage, PracticeRecordDetail } from '@/types/api';

const state = vi.hoisted(() => ({ directory: '', databaseUrl: '' }));

vi.mock('@/lib/prisma', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    state.directory = mkdtempSync(join(tmpdir(), 'practice-history-api-'));
    state.databaseUrl = `file:${join(state.directory, 'test.db')}`;
    return { prisma: new PrismaClient({ datasources: { db: { url: state.databaseUrl } } }) };
});
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { email: 'history@example.com' }, expires: '2099-01-01' })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));
vi.mock('@/lib/mastery', () => ({ scheduleMasteryEvaluation: vi.fn() }));
vi.mock('@/lib/review-state', () => ({ syncReviewState: vi.fn() }));

import { GET as HISTORY } from '@/app/api/practice/history/route';
import { GET as CALENDAR } from '@/app/api/practice/history/calendar/route';
import { GET as RECORD, DELETE } from '@/app/api/practice/record/[id]/route';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

const localImage = `local-image:${'a'.repeat(64)}.png`;
const getHistory = (query: string) => HISTORY(new Request(`http://localhost/api/practice/history?${query}`));
const getCalendar = (query: string) => CALENDAR(new Request(`http://localhost/api/practice/history/calendar?${query}`));
const getRecord = (id: string) => RECORD(new Request('http://localhost'), { params: Promise.resolve({ id }) });

describe('做题记录接口（隔离 SQLite）', () => {
    beforeAll(async () => {
        execFileSync(process.execPath, [path.resolve('node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
            env: { ...process.env, DATABASE_URL: state.databaseUrl }, stdio: 'pipe',
        });
        await prisma.$transaction([
            prisma.user.create({ data: { id: 'reader', email: 'history@example.com', password: 'unused-test-hash' } }),
            prisma.user.create({ data: { id: 'other', email: 'other@example.com', password: 'unused-test-hash' } }),
            prisma.subject.create({ data: { id: 'math', name: '数学新名称', userId: 'reader' } }),
            prisma.subject.create({ data: { id: 'english', name: '英语', userId: 'reader' } }),
            prisma.subject.create({ data: { id: 'foreign', name: '数学', userId: 'other' } }),
            prisma.errorItem.create({ data: {
                id: 'original', userId: 'reader', subjectId: 'math', questionText: '原题 $x^2$ 求值',
                originalImageUrl: localImage, figureSvg: '<svg>原题图</svg>', hasFigure: true,
                figureScale: 80, figureAlign: 'left', answerText: '原题答案', analysis: '原题解析',
            } }),
            prisma.examPaper.create({ data: { id: 'paper', userId: 'reader', title: '周末小测', status: 'ready', scope: 'all', difficulty: 'easy', requestedCount: 1, subjectIds: '["math"]' } }),
            prisma.examQuestion.create({ data: { id: 'exam-question', paperId: 'paper', order: 3, sourceShortId: 'q1' } }),
        ]);
        const base = { userId: 'reader', createdAt: new Date('2026-11-10T04:00:00Z') };
        await prisma.practiceRecord.createMany({ data: [
            { ...base, id: 'review', source: 'review', result: 'correct', isCorrect: false, errorItemId: 'original', subject: '旧名称', durationSec: 80, confidence: 'sure', questionText: '应忽略的快照', wrongAnswerText: '我写的答案', answerImageUrl: localImage, recognizedAnswer: '转写', gradeReason: '依据', notes: '笔记' },
            { ...base, id: 'manual', source: 'manual', result: 'wrong', errorItemId: 'original', createdAt: new Date('2026-11-10T03:00:00Z') },
            { ...base, id: 'practice', source: 'practice', result: 'wrong', isCorrect: true, questionText: '类似题 $x+1$', answerText: '类似题答案', analysis: '类似题解析', figureSvg: '<svg>新题图</svg>', errorItemId: 'original', originalImageUrl: localImage, answerImageUrl: 'https://example.invalid/answer.png' },
            { ...base, id: 'exam', createdAt: new Date('2026-11-10T05:00:00Z'), source: 'exam', result: 'not_attempted', isCorrect: false, examQuestionId: 'exam-question', questionText: '试卷新题', subject: '英语' },
            { ...base, id: 'legacy', source: 'practice', isCorrect: true, subject: '数学新名称', createdAt: new Date('2026-11-10T15:59:00Z') },
            { ...base, id: 'legacy-wrong', source: 'manual', isCorrect: false, subject: '英语', createdAt: new Date('2026-11-09T15:59:00Z') },
            { ...base, id: 'tomorrow', source: 'practice', result: 'correct', createdAt: new Date('2026-11-10T16:01:00Z') },
            { ...base, id: 'duplicate', source: 'duplicate_import', result: 'wrong' },
            { ...base, id: 'empty', source: 'review' },
            { ...base, id: 'unknown-source', source: 'future-source', result: 'wrong' },
            { ...base, id: 'foreign-record', userId: 'other', source: 'practice', result: 'wrong' },
            { ...base, id: 'old', source: 'review', result: 'wrong', createdAt: new Date('2025-01-01T04:00:00Z') },
            { ...base, id: 'oldest', source: 'practice', result: 'correct', createdAt: new Date('2024-01-01T04:00:00Z') },
        ] });
    }, 30_000);

    afterAll(async () => {
        await prisma.$disconnect();
        await rm(state.directory, { recursive: true, force: true });
    });

    it('按日期倒序、每天时间正序返回有效来源，并提供小结、预览和分页', async () => {
        const response = await getHistory('before=2026-11-11&days=7');
        const data: PracticeHistoryPage = await response.json();
        expect(response.status).toBe(200);
        expect(data.days.map(day => day.date)).toEqual(['2026-11-10', '2026-11-09']);
        expect(data.days[0].records.map(record => record.id)).toEqual(['manual', 'practice', 'review', 'exam', 'legacy']);
        expect(data.days[0].summary).toEqual({ total: 4, correct: 2, wrong: 2, notAttempted: 1, reviewDurationSec: 80 });
        expect(data.days[0].records.find(record => record.id === 'review')).toMatchObject({
            result: 'correct', subjectName: '数学新名称', preview: '原题 $x^2$ 求值', hasAnswerImage: true, hasAnswerText: true,
            createdAt: '2026-11-10T04:00:00.000Z', durationSec: 80, confidence: 'sure', errorItemId: 'original', exam: null,
        });
        expect(data.days[0].records.find(record => record.id === 'practice')?.preview).toBe('类似题 $x+1$');
        expect(data.days[0].records.find(record => record.id === 'exam')?.exam).toEqual({ paperId: 'paper', title: '周末小测', order: 3 });
        expect(data).toMatchObject({ nextBefore: '2026-11-04', hasMore: true });
    });

    it('空窗口通过最近一条记录跳到更早窗口，后续页无重叠，直到 hasMore=false', async () => {
        const findMany = vi.spyOn(prisma.practiceRecord, 'findMany');
        const findFirst = vi.spyOn(prisma.practiceRecord, 'findFirst');
        const data: PracticeHistoryPage = await (await getHistory('before=2026-11-04&days=7')).json();
        expect(data.days.map(day => day.date)).toEqual(['2025-01-01']);
        expect(data).toMatchObject({ nextBefore: '2024-12-26', hasMore: true });
        expect(findMany).toHaveBeenCalledTimes(2);
        expect(findFirst).toHaveBeenCalledTimes(2);
        const last: PracticeHistoryPage = await (await getHistory(`before=${data.nextBefore}&days=7`)).json();
        expect(last.days.map(day => day.date)).toEqual(['2024-01-01']);
        expect(last).toMatchObject({ nextBefore: null, hasMore: false });
        const empty = await (await getHistory('before=2024-01-01')).json();
        expect(empty).toEqual({ days: [], nextBefore: null, hasMore: false });
    });

    it('date 优先于窗口参数，空日期保持为空', async () => {
        const data: PracticeHistoryPage = await (await getHistory('date=2026-11-10&before=2024-01-01&days=1')).json();
        expect(data.days.map(day => day.date)).toEqual(['2026-11-10']);
        const empty = await (await getHistory('date=2026-11-08')).json();
        expect(empty).toEqual({ days: [], nextBefore: '2026-11-08', hasMore: true });
    });

    it('默认窗口包含应用时区的今天，不包含明天', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-10T15:59:00Z'));
        try {
            const data: PracticeHistoryPage = await (await getHistory('')).json();
            expect(data.days[0].date).toBe('2026-11-10');
        } finally {
            vi.useRealTimers();
        }
    });

    it('学科关联优先，独立记录回退到学科快照，拒绝他人或不存在的学科', async () => {
        const data: PracticeHistoryPage = await (await getHistory('date=2026-11-10&subjectId=math')).json();
        expect(data.days[0].records.map(record => record.id)).toEqual(['manual', 'practice', 'review', 'legacy']);
        expect(await (await getHistory('date=2026-11-10&subjectId=english')).json()).toMatchObject({ days: [{ records: [{ id: 'exam' }] }] });
        for (const subjectId of ['foreign', 'missing']) {
            expect((await getHistory(`subjectId=${subjectId}`)).status).toBe(400);
        }
    });

    it('只看 wrong 时兼容旧记录，result 优先于 isCorrect，没错的日期不返回', async () => {
        const data: PracticeHistoryPage = await (await getHistory('before=2026-11-12&result=wrong')).json();
        expect(data.days.map(day => day.date)).toEqual(['2026-11-10', '2026-11-09']);
        expect(data.days.flatMap(day => day.records.map(record => record.id))).toEqual(['manual', 'practice', 'legacy-wrong']);
        expect(data.days[0].summary).toMatchObject({ total: 2, correct: 0, wrong: 2 });
    });

    it.each(['days=0', 'days=32', 'days=1.5', 'days=', 'date=2026-02-30', 'before=bad', 'result=correct', 'subjectId='])('拒绝非法 history 参数 %s', async query => {
        expect((await getHistory(query)).status).toBe(400);
    });

    it('日历包含首尾日期并补零，没做不计入 total，支持学科筛选', async () => {
        const data: PracticeCalendarResponse = await (await getCalendar('from=2026-11-08&to=2026-11-11')).json();
        expect(data.days).toEqual([
            { date: '2026-11-08', total: 0, correct: 0 }, { date: '2026-11-09', total: 1, correct: 0 },
            { date: '2026-11-10', total: 4, correct: 2 }, { date: '2026-11-11', total: 1, correct: 1 },
        ]);
        const filtered = await (await getCalendar('from=2026-11-10&to=2026-11-10&subjectId=english')).json();
        expect(filtered.days).toEqual([{ date: '2026-11-10', total: 0, correct: 0 }]);
        expect((await getCalendar('from=2026-11-10&to=2026-11-10&subjectId=foreign')).status).toBe(400);
        const max = await (await getCalendar('from=2026-01-01&to=2026-03-03')).json();
        expect(max.days).toHaveLength(62);
    });

    it.each(['from=2026-01-01&to=2026-03-04', 'from=2026-11-10&to=2026-11-09', 'from=bad&to=2026-11-10', 'from=2026-11-10'])('拒绝非法日历区间 %s', async query => {
        expect((await getCalendar(query)).status).toBe(400);
    });

    it('详情返回原题内容、用时与作答快照，内部图片引用转换成鉴权地址', async () => {
        const response = await getRecord('review');
        const data: PracticeRecordDetail = await response.json();
        expect(response.status).toBe(200);
        expect(data).toMatchObject({
            id: 'review', source: 'review', result: 'correct', questionText: '原题 $x^2$ 求值',
            figureSvg: '<svg>原题图</svg>', figureScale: 80, figureAlign: 'left', hasFigure: true,
            subjectName: '数学新名称', durationSec: 80, confidence: 'sure', answerText: '原题答案', analysis: '原题解析',
            userAnswer: '我写的答案', answerImageUrl: '/api/error-items/original/image?record=review&field=answer',
            recognizedAnswer: '转写', gradeReason: '依据', notes: '笔记', errorItemId: 'original', exam: null,
        });
        expect(data.originalImageUrl).toMatch(/^\/api\/error-items\/original\/image\?v=\d+$/);
        expect(JSON.stringify(data)).not.toContain('local-image:');
        const manual = await (await getRecord('manual')).json();
        expect(manual.questionText).toBe('原题 $x^2$ 求值');
    });

    it('类似题与试卷保留快照、记录配图与试卷关联，外链原样返回', async () => {
        const practice = await (await getRecord('practice')).json();
        expect(practice).toMatchObject({ questionText: '类似题 $x+1$', answerText: '类似题答案', analysis: '类似题解析', figureSvg: '<svg>新题图</svg>', originalImageUrl: '/api/error-items/original/image?record=practice', answerImageUrl: 'https://example.invalid/answer.png' });
        const exam = await (await getRecord('exam')).json();
        expect(exam).toMatchObject({ questionText: '试卷新题', result: 'not_attempted', subjectName: '英语', exam: { paperId: 'paper', order: 3, title: '周末小测' } });
        const legacy = await (await getRecord('legacy')).json();
        expect(legacy.result).toBe('correct');
    });

    it('他人、不存在及排除的记录返回 404，匿名请求返回 401，保留 DELETE', async () => {
        for (const id of ['foreign-record', 'missing', 'duplicate', 'empty', 'unknown-source']) {
            expect((await getRecord(id)).status).toBe(404);
        }
        vi.mocked(getServerSession).mockResolvedValueOnce(null);
        expect((await getRecord('review')).status).toBe(401);
        vi.mocked(getServerSession).mockResolvedValueOnce(null);
        expect((await getHistory('')).status).toBe(401);
        vi.mocked(getServerSession).mockResolvedValueOnce(null);
        expect((await getCalendar('from=2026-11-10&to=2026-11-10')).status).toBe(401);
        expect(typeof DELETE).toBe('function');
    });
});
