// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    db: undefined as PrismaClient | undefined,
    email: 'attempt@example.com' as string | null,
    schedule: vi.fn(),
    grade: vi.fn(),
    locate: vi.fn(),
    dailyLimit: 0,
}));
vi.unmock('@/lib/ai-consent-store');
vi.mock('@/lib/ai', () => ({ getAIService: () => ({ gradeAnswer: mocks.grade, locateExamAnswers: mocks.locate }) }));
vi.mock('@/lib/config', async original => ({ ...(await original<typeof import('@/lib/config')>()), getAppConfig: () => ({ aiDailyLimit: mocks.dailyLimit }) }));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => mocks.email ? { user: { email: mocks.email }, expires: '2099-01-01' } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/mastery', async original => ({ ...(await original<typeof import('@/lib/mastery')>()), scheduleMasteryEvaluation: mocks.schedule }));

import { resetBackgroundTasksForTest, reserveBackgroundTask, findRunningTask } from '@/lib/background-tasks';
import { gradingTarget } from '@/lib/exam/exam-grading';
import { recordAiTokens } from '@/lib/ai-usage-context';
import { GET as PENDING } from '@/app/api/exam-attempts/pending/route';
import { POST as REGRADE } from '@/app/api/exams/[id]/attempts/[aid]/answers/[questionId]/regrade/route';
import { ANSWER_IMAGE } from '../fixtures/handwriting';
import { confirmAttempt, deleteAttempt, getAttempt, saveAnswer, setFinalResult, startAttempt, submitAttempt } from '@/lib/exam/exam-attempt';
import { imageDataUrl, localImagePath, storeImage } from '@/lib/image-storage';
import { pruneImages } from '@/lib/image-maintenance';
import { POST as START } from '@/app/api/exams/[id]/attempts/route';
import { GET, DELETE } from '@/app/api/exams/[id]/attempts/[aid]/route';
import { PUT, PATCH } from '@/app/api/exams/[id]/attempts/[aid]/answers/[questionId]/route';
import { GET as IMAGE } from '@/app/api/exams/[id]/attempts/[aid]/answers/[questionId]/image/route';
import { POST as MANUAL } from '@/app/api/exams/[id]/attempts/[aid]/manual/route';
import { POST as SUBMIT } from '@/app/api/exams/[id]/attempts/[aid]/submit/route';
import { POST as CONFIRM } from '@/app/api/exams/[id]/attempts/[aid]/confirm/route';
import { DELETE as DELETE_RECORD } from '@/app/api/practice/record/[id]/route';
import { GET as PAPER, DELETE as DELETE_PAPER } from '@/app/api/exams/[id]/route';

let db: PrismaClient;
let directory: string;
const context = (aid = 'missing', id = 'paper', questionId = 'q1') => ({ params: Promise.resolve({ id, aid, questionId }) });
const request = (method = 'GET', body?: unknown) => new Request('http://localhost/api/exams/paper/attempts', { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'exam-attempt-test-'));
    process.env.IMAGE_STORAGE_DIR = join(directory, 'images');
    process.env.CONFIG_DIR = join(directory, 'config');
    const url = `file:${join(directory, 'test.db')}`;
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    db = new PrismaClient({ datasources: { db: { url } } });
    mocks.db = db;
}, 120000);

beforeEach(async () => {
    mocks.email = 'attempt@example.com';
    mocks.schedule.mockClear();
    mocks.locate.mockReset();
    mocks.locate.mockResolvedValue({ pageReadable: true, paperCode: '', answers: [] });
    mocks.grade.mockReset();
    mocks.grade.mockResolvedValue({ correct: false, reason: '运算有误', recognizedAnswer: '学生答案' });
    mocks.dailyLimit = 0;
    resetBackgroundTasksForTest();
    await db.user.deleteMany();
    await db.user.createMany({ data: [
        { id: 'user', email: mocks.email, password: 'test-only' },
        { id: 'other', email: 'other@example.com', password: 'test-only' },
    ] });
    await db.subject.create({ data: { id: 'math', name: '数学', userId: 'user' } });
    for (const id of ['item1', 'item2']) await db.errorItem.create({ data: { id, userId: 'user', subjectId: 'math', originalImageUrl: '', questionText: '原题' } });
    await db.examPaper.create({ data: {
        id: 'paper', userId: 'user', title: '周末小测', status: 'ready', scope: 'all', difficulty: 'medium', mode: 'original', requestedCount: 3, subjectIds: '["math"]',
        questions: { create: [
            { id: 'q1', order: 0, sourceShortId: 'one', errorItemId: 'item1', questionText: '1+1=?', answerText: '2', analysis: '参考解析', status: 'ready' },
            { id: 'q2', order: 1, sourceShortId: 'two', errorItemId: 'item2', questionText: '求值', answerText: 'A', status: 'ready' },
            { id: 'q3', order: 2, sourceShortId: 'gone', questionText: '原题已删除', answerText: 'B', status: 'ready' },
        ] },
    } });
});

afterAll(async () => {
    await db?.$disconnect();
    delete process.env.IMAGE_STORAGE_DIR;
    delete process.env.CONFIG_DIR;
    if (directory) rmSync(directory, { recursive: true, force: true });
});

describe('试卷作答服务与真实接口', () => {
    it('开始、跨方式复用与并发开始只有一个未完成作答，手动直接待确认', async () => {
        const [first, second] = await Promise.all([startAttempt('paper', 'user', 'online'), startAttempt('paper', 'user', 'manual')]);
        expect(first.id).toBe(second.id);
        expect(await db.examAttempt.count()).toBe(1);
        await deleteAttempt('paper', 'user', first.id);
        const manual = await startAttempt('paper', 'user', 'manual');
        expect(manual.status).toBe('reviewing');
        await expect(startAttempt('paper', 'other', 'online')).rejects.toThrow('EXAM_NOT_FOUND');
        await setFinalResult('paper', 'user', manual.id, 'q1', 'correct');
        await setFinalResult('paper', 'user', manual.id, 'q2', 'wrong');
        await confirmAttempt('paper', 'user', manual.id);
        const next = await startAttempt('paper', 'user', 'online');
        expect(next.id).not.toBe(manual.id);
        expect((await submitAttempt('paper', 'user', next.id)).durationSec).toBeNull();
    });

    it('作答中和批改中不泄露参考答案与解析，待确认后提供', async () => {
        const attempt = await startAttempt('paper', 'user', 'online');
        for (const status of ['answering', 'grading']) {
            await db.examAttempt.update({ where: { id: attempt.id }, data: { status } });
            const handle = status === 'grading' ? reserveBackgroundTask({ userId: 'user', kind: 'exam-grade', target: gradingTarget(attempt.id) }) : null;
            const detail = await getAttempt('paper', 'user', attempt.id);
            handle?.cancel();
            expect(detail.paper.questions[0]).not.toHaveProperty('answerText');
            expect(detail.paper.questions[0]).not.toHaveProperty('analysis');
            expect(detail.paper.questions[0]).toMatchObject({ order: 0, hasOriginal: true });
        }
        await db.examAttempt.update({ where: { id: attempt.id }, data: { status: 'reviewing' } });
        expect((await getAttempt('paper', 'user', attempt.id)).paper.questions[0]).toMatchObject({ answerText: '2', analysis: '参考解析' });
    });

    it('结果页编号与按题型分大题的纸卷一致，空快照回退来源题型', async () => {
        await db.examPaper.update({ where: { id: 'paper' }, data: { groupByType: true } });
        await db.examQuestion.update({ where: { id: 'q1' }, data: { questionType: 'solution' } });
        await db.errorItem.update({ where: { id: 'item2' }, data: { questionType: 'single_choice' } });
        const attempt = await startAttempt('paper', 'user', 'manual');
        const detail = await getAttempt('paper', 'user', attempt.id);
        expect(detail.paper.questions.map(question => [question.id, question.displayNumber])).toEqual([['q1', 2], ['q2', 1], ['q3', 3]]);
    });

    it('保存、替换与清空图片，保留文字小旗，累计时长不倒退，引用图片不会被清理', async () => {
        const attempt = await startAttempt('paper', 'user', 'online');
        const first = await saveAnswer('paper', 'user', attempt.id, 'q1', { answerText: '2', answerImage: ANSWER_IMAGE, flagged: true, durationSec: 15 });
        expect(await imageDataUrl(first.answerImageUrl!)).toBe(ANSWER_IMAGE);
        expect((await pruneImages(db, true)).removed).toBe(0);
        const next = await saveAnswer('paper', 'user', attempt.id, 'q1', { answerImage: ANSWER_IMAGE, durationSec: 8 });
        expect(next).toMatchObject({ answerText: '2', flagged: true });
        expect(next.answerImageUrl).toBe(first.answerImageUrl);
        expect(existsSync(localImagePath(first.answerImageUrl!))).toBe(true);
        expect((await db.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).durationSec).toBe(15);
        await expect(saveAnswer('paper', 'user', attempt.id, 'q1', { answerImage: 'local-image:bad' })).rejects.toThrow();
        await expect(saveAnswer('paper', 'user', attempt.id, 'missing', {})).rejects.toThrow('EXAM_QUESTION_NOT_FOUND');
        await saveAnswer('paper', 'user', attempt.id, 'q2', { answerImage: ANSWER_IMAGE });
        const replaced = await saveAnswer('paper', 'user', attempt.id, 'q1', { answerImage: `data:image/png;base64,${PNG.sync.write(new PNG({ width: 2, height: 2 })).toString('base64')}` });
        expect(replaced.answerImageUrl).not.toBe(first.answerImageUrl);
        expect(existsSync(localImagePath(first.answerImageUrl!))).toBe(true);
        await saveAnswer('paper', 'user', attempt.id, 'q1', { answerImage: null });
        expect(existsSync(localImagePath(replaced.answerImageUrl!))).toBe(false);
        expect(existsSync(localImagePath(first.answerImageUrl!))).toBe(true);
        await saveAnswer('paper', 'user', attempt.id, 'q2', { answerImage: null });
        expect(existsSync(localImagePath(first.answerImageUrl!))).toBe(false);
    });

    it('交卷预填文字匹配、留空没做，带图答案待人工判断，交卷后答案锁定', async () => {
        const attempt = await startAttempt('paper', 'user', 'online');
        await saveAnswer('paper', 'user', attempt.id, 'q1', { answerText: '2', durationSec: 30 });
        await saveAnswer('paper', 'user', attempt.id, 'q2', { answerText: 'A', answerImage: ANSWER_IMAGE });
        const submitted = await submitAttempt('paper', 'user', attempt.id, 20);
        expect(submitted).toMatchObject({ status: 'reviewing', durationSec: 30, submittedAt: expect.any(Date) });
        expect(submitted.answers.find(answer => answer.examQuestionId === 'q1')).toMatchObject({ aiResult: 'correct', finalResult: 'correct' });
        expect(submitted.answers.find(answer => answer.examQuestionId === 'q2')).toMatchObject({ aiResult: null, finalResult: null });
        expect(submitted.answers.find(answer => answer.examQuestionId === 'q3')).toMatchObject({ aiResult: null, finalResult: 'not_attempted' });
        await expect(confirmAttempt('paper', 'user', attempt.id)).rejects.toThrow('EXAM_ATTEMPT_INCOMPLETE');
        expect(await db.practiceRecord.count()).toBe(0);
        await expect(saveAnswer('paper', 'user', attempt.id, 'q1', { answerText: '改答' })).rejects.toThrow('EXAM_ATTEMPT_INVALID_STATUS');
        await expect(submitAttempt('paper', 'user', attempt.id)).rejects.toThrow('EXAM_ATTEMPT_INVALID_STATUS');
    });

    it('确认写入快照、共用图片、复习安排与交卷时间，重复确认替换记录并保留旧手动录入', async () => {
        const attempt = await startAttempt('paper', 'user', 'online');
        const saved = await saveAnswer('paper', 'user', attempt.id, 'q1', { answerText: '2', answerImage: ANSWER_IMAGE });
        const submitted = await submitAttempt('paper', 'user', attempt.id, 42);
        await setFinalResult('paper', 'user', attempt.id, 'q1', 'correct');
        await db.examAttemptAnswer.update({ where: { id: saved.id }, data: { recognizedAnswer: '识别内容', aiReason: '判题依据' } });
        await db.practiceRecord.create({ data: { userId: 'user', errorItemId: 'item1', source: 'exam', result: 'wrong', examQuestionId: 'q1' } });
        expect(await confirmAttempt('paper', 'user', attempt.id)).toEqual(['item1', 'item2']);
        const records = await db.practiceRecord.findMany({ where: { examAttemptId: attempt.id }, orderBy: { examQuestionId: 'asc' } });
        expect(records).toHaveLength(2);
        expect(records[0]).toMatchObject({ source: 'exam', result: 'correct', isCorrect: true, createdAt: submitted.submittedAt, durationSec: null, difficulty: null, subject: '数学', questionText: '1+1=?', wrongAnswerText: '2', recognizedAnswer: '识别内容', gradeReason: '判题依据' });
        expect(records[0].answerImageUrl).toBe(saved.answerImageUrl);
        expect(await imageDataUrl(records[0].answerImageUrl!)).toBe(ANSWER_IMAGE);
        expect((await db.errorItem.findUniqueOrThrow({ where: { id: 'item1' } })).reviewSyncedAt).not.toBeNull();
        expect((await db.examPaper.findUniqueOrThrow({ where: { id: 'paper' } })).resultsRecordedAt).not.toBeNull();
        await setFinalResult('paper', 'user', attempt.id, 'q1', 'wrong');
        await confirmAttempt('paper', 'user', attempt.id);
        expect(await db.practiceRecord.count()).toBe(3);
        expect(await db.practiceRecord.findFirst({ where: { examAttemptId: attempt.id, examQuestionId: 'q1' } })).toMatchObject({ result: 'wrong', createdAt: submitted.submittedAt });
        expect(existsSync(localImagePath(records[0].answerImageUrl!))).toBe(true);
        expect(existsSync(localImagePath(saved.answerImageUrl!))).toBe(true);
        await expect(deleteAttempt('paper', 'user', attempt.id)).rejects.toThrow('EXAM_ATTEMPT_INVALID_STATUS');
        // 删除历史不能影响仍被作答引用的图片；重新确认后再次共用引用。
        const current = await db.practiceRecord.findFirstOrThrow({ where: { examAttemptId: attempt.id, examQuestionId: 'q1' } });
        expect((await DELETE_RECORD(request('DELETE'), { params: Promise.resolve({ id: current.id }) })).status).toBe(200);
        await pruneImages(db, true);
        expect(existsSync(localImagePath(saved.answerImageUrl!))).toBe(true);
        await confirmAttempt('paper', 'user', attempt.id);
        // 删除试卷级联删除作答，已保存的历史及共用图片保留。
        expect((await DELETE_PAPER(request('DELETE'), { params: Promise.resolve({ id: 'paper' }) })).status).toBe(200);
        await pruneImages(db, true);
        expect(await db.examAttempt.count()).toBe(0);
        expect(await db.practiceRecord.findMany()).toEqual(expect.arrayContaining([expect.objectContaining({ examAttemptId: null, examQuestionId: null })]));
        const retained = await db.practiceRecord.findFirstOrThrow({ where: { answerImageUrl: { not: null } } });
        expect(await imageDataUrl(retained.answerImageUrl!)).toBe(ANSWER_IMAGE);
        expect((await DELETE_RECORD(request('DELETE'), { params: Promise.resolve({ id: retained.id }) })).status).toBe(200);
        await pruneImages(db, true);
        expect(existsSync(localImagePath(saved.answerImageUrl!))).toBe(false);
    });

    it('放弃未保存作答会删除逐题图片和整页图片，维护保护整页引用', async () => {
        const attempt = await startAttempt('paper', 'user', 'photo');
        const saved = await saveAnswer('paper', 'user', attempt.id, 'q1', { answerImage: ANSWER_IMAGE });
        const page = await storeImage(ANSWER_IMAGE);
        await db.examAttempt.update({ where: { id: attempt.id }, data: { pageImages: JSON.stringify([page]) } });
        expect((await pruneImages(db, true)).removed).toBeGreaterThanOrEqual(0);
        expect(existsSync(localImagePath(page))).toBe(true);
        await deleteAttempt('paper', 'user', attempt.id);
        expect(await db.examAttemptAnswer.count()).toBe(0);
        expect(existsSync(localImagePath(saved.answerImageUrl!))).toBe(false);
        expect(existsSync(localImagePath(page))).toBe(false);
    });

    it('放弃作答保留其他作答与历史共用的图片，最后解除引用才删除', async () => {
        const attempt = await startAttempt('paper', 'user', 'online');
        const saved = await saveAnswer('paper', 'user', attempt.id, 'q1', { answerImage: ANSWER_IMAGE });
        const record = await db.practiceRecord.create({ data: { userId: 'user', errorItemId: 'item1', answerImageUrl: saved.answerImageUrl } });
        await deleteAttempt('paper', 'user', attempt.id);
        expect(existsSync(localImagePath(saved.answerImageUrl!))).toBe(true);
        const next = await startAttempt('paper', 'user', 'photo');
        await db.examAttempt.update({ where: { id: next.id }, data: { pageImages: JSON.stringify([saved.answerImageUrl]) } });
        expect((await DELETE_RECORD(request('DELETE'), { params: Promise.resolve({ id: record.id }) })).status).toBe(200);
        await pruneImages(db, true);
        expect(existsSync(localImagePath(saved.answerImageUrl!))).toBe(true);
        await deleteAttempt('paper', 'user', next.id);
        expect(existsSync(localImagePath(saved.answerImageUrl!))).toBe(false);
    });

    it('接口校验、图片读取、摘要、状态冲突与确认调度贯通', async () => {
        expect((await START(request('POST', { kind: 'bad' }), context())).status).toBe(400);
        const started = await START(request('POST', { kind: 'online' }), context());
        expect(started.status).toBe(200);
        const { id } = await started.json() as { id: string };
        const ctx = context(id);
        expect((await GET(request(), ctx)).status).toBe(200);
        expect((await PATCH(request('PATCH', { finalResult: 'wrong' }), ctx)).status).toBe(409);
        expect((await PUT(request('PUT', { answerText: '2', answerImage: ANSWER_IMAGE, flagged: true, durationSec: 10 }), ctx)).status).toBe(200);
        const image = await IMAGE(request(), ctx);
        expect(image.status).toBe(200);
        expect(image.headers.get('Content-Type')).toBe('image/png');
        expect(Buffer.from(await image.arrayBuffer()).toString('base64')).toBe(ANSWER_IMAGE.split(',')[1]);
        const paper = await (await PAPER(request(), { params: Promise.resolve({ id: 'paper' }) })).json();
        expect(paper.attempts).toEqual([expect.objectContaining({ id, kind: 'online', status: 'answering', answeredCount: 1 })]);
        expect((await SUBMIT(request('POST', { durationSec: 11 }), ctx)).status).toBe(200);
        const incomplete = await CONFIRM(request('POST'), ctx);
        expect(incomplete.status).toBe(409);
        expect(await incomplete.json()).toMatchObject({ code: 'EXAM_ATTEMPT_INCOMPLETE' });
        expect((await PATCH(request('PATCH', { finalResult: 'correct' }), ctx)).status).toBe(200);
        expect((await CONFIRM(request('POST'), ctx)).status).toBe(200);
        expect(mocks.schedule).toHaveBeenCalledWith(['item1', 'item2']);
        expect((await DELETE(request('DELETE'), ctx)).status).toBe(409);
        expect((await START(new Request('http://localhost', { method: 'POST', body: '{' }), context())).status).toBe(400);
    });

    it('手动确认接受 takenAt，重复确认更新原记录日期；非法与未来日期不写入', async () => {
        const attempt = await startAttempt('paper', 'user', 'manual');
        const ctx = context(attempt.id);
        await setFinalResult('paper', 'user', attempt.id, 'q1', 'correct');
        await setFinalResult('paper', 'user', attempt.id, 'q2', 'wrong');
        for (const takenAt of ['bad', '2026-02-30T12:00:00Z', new Date(Date.now() + 86400000).toISOString()]) {
            expect((await CONFIRM(request('POST', { takenAt }), ctx)).status).toBe(400);
            expect(await db.practiceRecord.count()).toBe(0);
        }
        const first = '2026-01-17T04:00:00.000Z';
        expect((await CONFIRM(request('POST', { takenAt: first }), ctx)).status).toBe(200);
        expect(await db.practiceRecord.findMany()).toEqual([
            expect.objectContaining({ examAttemptId: attempt.id, createdAt: new Date(first) }),
            expect.objectContaining({ examAttemptId: attempt.id, createdAt: new Date(first) }),
        ]);
        expect(await db.examAttempt.findUnique({ where: { id: attempt.id } })).toMatchObject({ status: 'done', submittedAt: new Date(first) });
        expect((await getAttempt('paper', 'user', attempt.id)).number).toBe(1);
        const second = '2026-01-16T04:00:00.000Z';
        expect((await CONFIRM(request('POST', { takenAt: second }), ctx)).status).toBe(200);
        expect(await db.practiceRecord.count()).toBe(2);
        expect((await db.practiceRecord.findMany()).every(record => record.createdAt.toISOString() === second)).toBe(true);
        expect((await CONFIRM(request('POST'), ctx)).status).toBe(200);
        expect((await db.practiceRecord.findMany()).every(record => record.createdAt.toISOString() === second)).toBe(true);
        const paper = await (await PAPER(request(), { params: Promise.resolve({ id: 'paper' }) })).json();
        expect(paper.questions[0].attempts[0].examAttemptId).toBe(attempt.id);
        const next = await startAttempt('paper', 'user', 'manual');
        expect((await getAttempt('paper', 'user', next.id)).number).toBe(2);
    });

    it.each(['online', 'photo'] as const)('%s 确认忽略 takenAt，继续使用交卷时间', async kind => {
        const attempt = await startAttempt('paper', 'user', kind);
        if (kind === 'photo') await changeExamPages('paper', 'user', attempt.id, { kind: 'add', image: ANSWER_IMAGE, expected: [] });
        const submitted = await submitAttempt('paper', 'user', attempt.id);
        if (kind === 'photo') {
            await setFinalResult('paper', 'user', attempt.id, 'q1', 'not_attempted');
            await setFinalResult('paper', 'user', attempt.id, 'q2', 'not_attempted');
        }
        expect((await CONFIRM(request('POST', { takenAt: '2026-01-17T04:00:00Z' }), context(attempt.id))).status).toBe(200);
        expect((await db.practiceRecord.findMany()).every(record => record.createdAt.getTime() === submitted.submittedAt!.getTime())).toBe(true);
        expect((await getAttempt('paper', 'user', attempt.id)).submittedAt).toEqual(submitted.submittedAt);
    });

    it('所有接口对越权、错试卷或错题统一 404，未登录 401', async () => {
        const attempt = await startAttempt('paper', 'user', 'online');
        const ctx = context(attempt.id);
        mocks.email = 'other@example.com';
        for (const action of [
            () => START(request('POST', { kind: 'manual' }), ctx), () => GET(request(), ctx),
            () => PUT(request('PUT', { answerText: '2' }), ctx), () => PATCH(request('PATCH', { finalResult: 'correct' }), ctx),
            () => SUBMIT(request('POST', {}), ctx), () => CONFIRM(request('POST'), ctx),
            () => DELETE(request('DELETE'), ctx), () => IMAGE(request(), ctx),
        ]) expect((await action()).status).toBe(404);
        mocks.email = 'attempt@example.com';
        expect((await GET(request(), context(attempt.id, 'wrong-paper'))).status).toBe(404);
        expect((await PUT(request('PUT', {}), context(attempt.id, 'paper', 'missing'))).status).toBe(404);
        mocks.email = null;
        expect((await START(request('POST', { kind: 'online' }), ctx)).status).toBe(401);
    });
});


async function awaitGraded(id: string) {
    await vi.waitFor(async () => {
        expect(findRunningTask('user', gradingTarget(id))).toBeNull();
        expect((await db.examAttempt.findUniqueOrThrow({ where: { id } })).status).toBe('reviewing');
    });
    return getAttempt('paper', 'user', id);
}

describe('在线试卷后台判题', () => {
    it('今天摘要只显示当前账号的待批改或待确认在线作答，不含学生答案', async () => {
        const attempt = await startAttempt('paper', 'user', 'online');
        await db.examAttempt.update({ where: { id: attempt.id }, data: { status: 'reviewing' } });
        await db.examAttempt.create({ data: { paperId: 'paper', userId: 'user', kind: 'manual', status: 'reviewing' } });
        await db.examAttempt.create({ data: { paperId: 'paper', userId: 'user', kind: 'online', status: 'done' } });
        const response = await PENDING(request());
        expect(await response.json()).toEqual([{ id: attempt.id, paperId: 'paper', status: 'reviewing', paper: { title: '周末小测' } }]);
        mocks.email = 'other@example.com';
        expect(await (await PENDING(request())).json()).toEqual([]);
    });
    it('保存最多四张原图，引用扫描保护，confirm 清空并仅回收无引用原图', async () => {
        const attempt = await startAttempt('paper', 'user', 'online');
        const original = `data:image/png;base64,${PNG.sync.write(new PNG({ width: 3, height: 2 })).toString('base64')}`;
        const saved = await saveAnswer('paper', 'user', attempt.id, 'q1', { answerImage: ANSWER_IMAGE, answerImages: [original, ANSWER_IMAGE] });
        const refs = JSON.parse(saved.gradingImages!) as string[];
        await pruneImages(db, true);
        expect(await imageDataUrl(refs[0])).toBe(original);
        await expect(saveAnswer('paper', 'user', attempt.id, 'q1', { answerImages: Array(5).fill(ANSWER_IMAGE) })).rejects.toThrow();
        await submitAttempt('paper', 'user', attempt.id);
        await setFinalResult('paper', 'user', attempt.id, 'q1', 'wrong');
        await confirmAttempt('paper', 'user', attempt.id);
        expect((await db.examAttemptAnswer.findUniqueOrThrow({ where: { id: saved.id } })).gradingImages).toBeNull();
        expect(existsSync(localImagePath(refs[0]))).toBe(false);
        expect(existsSync(localImagePath(saved.answerImageUrl!))).toBe(true);
    });

    it('本地判对不送 AI，其余逐题写回且整卷只扣一次，保留实际 token', async () => {
        await db.user.update({ where: { id: 'user' }, data: { aiDataConsentAt: new Date() } });
        const attempt = await startAttempt('paper', 'user', 'online');
        await saveAnswer('paper', 'user', attempt.id, 'q1', { answerText: '2' });
        await saveAnswer('paper', 'user', attempt.id, 'q2', { answerText: 'B', answerImages: [ANSWER_IMAGE], answerImage: ANSWER_IMAGE });
        let finish!: () => void;
        mocks.grade.mockImplementation(async () => {
            await new Promise<void>(resolve => { finish = resolve; });
            await recordAiTokens({ provider: 'openai', model: 'mock', inputTokens: 11, outputTokens: 7 });
            return { correct: false, reason: '步骤有误', recognizedAnswer: 'B' };
        });
        const submitted = await submitAttempt('paper', 'user', attempt.id);
        expect(submitted.status).toBe('grading');
        expect(submitted.paper.questions[0]).not.toHaveProperty('answerText');
        await vi.waitFor(() => expect(mocks.grade).toHaveBeenCalledTimes(1));
        expect(mocks.grade).toHaveBeenCalledWith(expect.objectContaining({ questionText: '求值', answerText: 'A', userAnswer: 'B', answerImages: [ANSWER_IMAGE] }));
        expect(submitted.answers.find(answer => answer.examQuestionId === 'q1')).toMatchObject({ aiResult: 'correct', finalResult: 'correct' });
        finish();
        const graded = await awaitGraded(attempt.id);
        expect(graded.answers.find(answer => answer.examQuestionId === 'q2')).toMatchObject({ aiResult: 'wrong', finalResult: 'wrong', recognizedAnswer: 'B', aiReason: '步骤有误' });
        expect(await db.aiUsage.findMany()).toEqual([expect.objectContaining({ kind: 'exam-grade', inputTokens: 11, outputTokens: 7 })]);
        mocks.grade.mockImplementation(async () => {
            await recordAiTokens({ provider: 'openai', model: 'mock', inputTokens: 5, outputTokens: 2 });
            return { correct: true, reason: '复核正确' };
        });
        expect((await REGRADE(request('POST'), context(attempt.id, 'paper', 'q2'))).status).toBe(200);
        await awaitGraded(attempt.id);
        expect(await db.aiUsage.findMany()).toEqual([expect.objectContaining({ kind: 'exam-grade', inputTokens: 16, outputTokens: 9 })]);

    });

    it('并发三题，单题失败和看不清均不预填，其余题继续完成', async () => {
        await db.user.update({ where: { id: 'user' }, data: { aiDataConsentAt: new Date() } });
        const attempt = await startAttempt('paper', 'user', 'online');
        for (const id of ['q1', 'q2', 'q3']) await saveAnswer('paper', 'user', attempt.id, id, { answerText: 'x' });
        const releases: (() => void)[] = [];
        mocks.grade.mockImplementation(async (input: { questionText: string }) => {
            await new Promise<void>(resolve => releases.push(resolve));
            if (input.questionText === '求值') throw new Error('mock failure');
            return { correct: true, unreadable: input.questionText === '原题已删除', reason: 'mock' };
        });
        expect((await submitAttempt('paper', 'user', attempt.id)).status).toBe('grading');
        await vi.waitFor(() => expect(releases).toHaveLength(3));
        releases.forEach(release => release());
        const graded = await awaitGraded(attempt.id);
        expect(graded.answers.find(answer => answer.examQuestionId === 'q1')).toMatchObject({ aiResult: 'correct', finalResult: 'correct' });
        expect(graded.answers.find(answer => answer.examQuestionId === 'q2')).toMatchObject({ aiResult: 'unknown', finalResult: null, aiReason: 'EXAM_GRADE_FAILED' });
        expect(graded.answers.find(answer => answer.examQuestionId === 'q3')).toMatchObject({ aiResult: 'unknown', finalResult: null });
    });

    it('额度不足不启动 AI，未知题保持还没判且不能借重判绕过额度', async () => {
        mocks.dailyLimit = 1;
        await db.user.update({ where: { id: 'user' }, data: { aiDataConsentAt: new Date() } });
        await db.aiUsage.create({ data: { userId: 'user', kind: 'grade' } });
        const attempt = await startAttempt('paper', 'user', 'online');
        await saveAnswer('paper', 'user', attempt.id, 'q1', { answerText: 'x' });
        const detail = await submitAttempt('paper', 'user', attempt.id);
        expect(detail).toMatchObject({ status: 'reviewing', gradingNotice: 'AI_DAILY_LIMIT_EXCEEDED' });
        expect(detail.answers.find(answer => answer.examQuestionId === 'q1')).toMatchObject({ aiResult: null, finalResult: null, canRetry: false });
        expect(mocks.grade).not.toHaveBeenCalled();
        expect((await REGRADE(request('POST'), context(attempt.id))).status).toBe(409);
        expect(await db.aiUsage.count()).toBe(1);
    });

    it('扣额前中断仍检查额度，不能以重判绕过每日上限', async () => {
        mocks.dailyLimit = 1;
        await db.user.update({ where: { id: 'user' }, data: { aiDataConsentAt: new Date() } });
        await db.aiUsage.create({ data: { userId: 'user', kind: 'grade' } });
        const attempt = await startAttempt('paper', 'user', 'online');
        await saveAnswer('paper', 'user', attempt.id, 'q1', { answerText: 'x' });
        await db.examAttempt.update({ where: { id: attempt.id }, data: { status: 'grading' } });
        await getAttempt('paper', 'user', attempt.id);
        expect((await REGRADE(request('POST'), context(attempt.id))).status).toBe(429);
        expect(mocks.grade).not.toHaveBeenCalled();
        expect(await db.aiUsage.count()).toBe(1);
    });

    it('GET 恢复中断，单题重判持久限两次且整卷合计一次额度，越权不能重判', async () => {
        const attempt = await startAttempt('paper', 'user', 'online');
        await saveAnswer('paper', 'user', attempt.id, 'q1', { answerText: 'x' });
        await db.examAttempt.update({ where: { id: attempt.id }, data: { status: 'grading' } });
        const detail = await getAttempt('paper', 'user', attempt.id);
        expect(detail.status).toBe('reviewing');
        expect(detail.answers[0]).toMatchObject({ aiResult: 'unknown', aiReason: 'EXAM_GRADE_FAILED', canRetry: true });
        await db.user.update({ where: { id: 'user' }, data: { aiDataConsentAt: new Date() } });
        for (let n = 0; n < 2; n++) {
            expect((await REGRADE(request('POST'), context(attempt.id))).status).toBe(200);
            await awaitGraded(attempt.id);
        }
        expect((await REGRADE(request('POST'), context(attempt.id))).status).toBe(409);
        expect(mocks.grade).toHaveBeenCalledTimes(2);
        expect((await db.examAttemptAnswer.findFirstOrThrow({ where: { attemptId: attempt.id } })).gradingRetries).toBe(2);
        expect(await db.aiUsage.count({ where: { kind: 'exam-grade' } })).toBe(1);
        mocks.email = 'other@example.com';
        expect((await REGRADE(request('POST'), context(attempt.id))).status).toBe(404);
    });
});


import { changeExamPages } from '@/lib/exam/exam-photo-pages';
import { POST as ADD_PAGE, PUT as REPLACE_PAGES } from '@/app/api/exams/[id]/attempts/[aid]/pages/route';
import { DELETE as DELETE_PAGE } from '@/app/api/exams/[id]/attempts/[aid]/pages/[index]/route';
import { GET as PAGE_IMAGE } from '@/app/api/exams/[id]/attempts/[aid]/pages/[index]/image/route';

const photoImage = (width: number) => `data:image/png;base64,${PNG.sync.write(new PNG({ width, height: 30 })).toString('base64')}`;
const locatedAnswer = (number: number, handMark = 'none', legible = true) => ({ number, handMark, legible, transcript: '解答过程', region: { x: 0.1, y: 0.1, width: 0.8, height: 0.7 } });

describe('拍照交卷全链路', () => {
    it('照片接口上限、排序、替换、鉴权及图片回收', async () => {
        const attempt = await startAttempt('paper', 'user', 'photo');
        const ctx = context(attempt.id);
        const webp = `data:image/webp;base64,${Buffer.from('RIFF0000WEBP0000').toString('base64')}`;
        expect((await ADD_PAGE(request('POST', { image: webp, expected: [] }), ctx)).status).toBe(400);
        let pages: string[] = [];
        for (let i = 0; i < 8; i++) {
            const response = await ADD_PAGE(request('POST', { image: photoImage(10 + i), expected: pages }), ctx);
            expect(response.status).toBe(200);
            pages = (await response.json()).pages;
        }
        expect((await ADD_PAGE(request('POST', { image: photoImage(99), expected: pages }), ctx)).status).toBe(400);
        const sorted = await REPLACE_PAGES(request('PUT', { pages: [...pages].reverse(), expected: pages }), ctx);
        expect(sorted.status).toBe(200);
        expect((await sorted.json()).pages).toEqual([...pages].reverse());
        const indexCtx = { params: Promise.resolve({ id: 'paper', aid: attempt.id, index: '0' }) };
        expect((await PAGE_IMAGE(request(), indexCtx)).status).toBe(200);
        mocks.email = 'other@example.com';
        expect((await ADD_PAGE(request('POST', { image: ANSWER_IMAGE, expected: [] }), ctx)).status).toBe(404);
        expect((await PAGE_IMAGE(request(), indexCtx)).status).toBe(404);
        expect((await DELETE_PAGE(request('DELETE'), indexCtx)).status).toBe(404);
        mocks.email = 'attempt@example.com';
        const foreign = await storeImage(photoImage(99));
        expect((await REPLACE_PAGES(request('PUT', { pages: [foreign], expected: [...pages].reverse() }), ctx)).status).toBe(400);
        const replacement = await REPLACE_PAGES(request('PUT', { pages: [ANSWER_IMAGE], expected: [...pages].reverse() }), ctx);
        expect(replacement.status).toBe(200);
        expect(existsSync(localImagePath(pages[0]))).toBe(false);
        const saved = (await replacement.json()).pages[0];
        expect((await DELETE_PAGE(request('DELETE'), indexCtx)).status).toBe(200);
        expect(existsSync(localImagePath(saved))).toBe(false);
        expect((await SUBMIT(request('POST', {}), ctx)).status).toBe(409);
    });

    it('两页定位、跨页裁剪、多图判题、红笔预填、没找到与补拍，确认保留整页', async () => {
        await db.user.update({ where: { id: 'user' }, data: { aiDataConsentAt: new Date() } });
        const attempt = await startAttempt('paper', 'user', 'photo');
        const first = await changeExamPages('paper', 'user', attempt.id, { kind: 'add', image: photoImage(40), expected: [] });
        await changeExamPages('paper', 'user', attempt.id, { kind: 'add', image: photoImage(50), expected: first.pages });
        mocks.locate.mockResolvedValueOnce({ pageReadable: true, paperCode: '', answers: [locatedAnswer(1, 'correct')] })
            .mockResolvedValueOnce({ pageReadable: true, paperCode: '', answers: [locatedAnswer(1, 'correct')] });
        await submitAttempt('paper', 'user', attempt.id);
        const detail = await awaitGraded(attempt.id);
        expect(mocks.locate).toHaveBeenCalledTimes(2);
        expect(mocks.grade).toHaveBeenCalledTimes(1);
        expect(mocks.grade.mock.calls[0][0].answerImages).toHaveLength(2);
        expect(detail.handMarked).toBe(true);
        expect(detail.answers.find(answer => answer.examQuestionId === 'q1')).toMatchObject({ handMark: 'correct', aiResult: 'wrong', finalResult: 'correct', recognizedAnswer: '解答过程\n解答过程', pageIndex: 0 });
        expect(detail.answers.find(answer => answer.examQuestionId === 'q2')).toMatchObject({ aiReason: 'EXAM_ANSWER_NOT_FOUND', aiResult: null, finalResult: null });
        await setFinalResult('paper', 'user', attempt.id, 'q1', 'wrong');
        expect((await REGRADE(request('POST', { photos: [photoImage(60), photoImage(70)] }), context(attempt.id, 'paper', 'q2'))).status).toBe(200);
        await awaitGraded(attempt.id);
        expect(mocks.grade.mock.calls[1][0].answerImages).toHaveLength(2);
        expect((await getAttempt('paper', 'user', attempt.id)).answers.find(answer => answer.examQuestionId === 'q1')?.finalResult).toBe('wrong');
        expect((await REGRADE(request('POST', {}), context(attempt.id, 'paper', 'q2'))).status).toBe(200);
        await awaitGraded(attempt.id);
        expect((await REGRADE(request('POST', {}), context(attempt.id, 'paper', 'q2'))).status).toBe(409);
        await confirmAttempt('paper', 'user', attempt.id);
        const stored = await db.examAttempt.findUniqueOrThrow({ where: { id: attempt.id }, include: { answers: true } });
        expect(stored.answers.every(answer => answer.gradingImages === null)).toBe(true);
        expect(JSON.parse(stored.pageImages!)).toHaveLength(2);
        expect((await db.aiUsage.findMany({ where: { userId: 'user', kind: 'exam-grade' } }))).toHaveLength(1);
        await expect(changeExamPages('paper', 'user', attempt.id, { kind: 'delete', index: 0 })).rejects.toThrow('EXAM_ATTEMPT_INVALID_STATUS');
    });

    it.each(['unreadable', 'wrong_paper'])('问题页 %s 返回拍照页，重拍只定位变化页，不重复计额度', async reason => {
        await db.user.update({ where: { id: 'user' }, data: { aiDataConsentAt: new Date() } });
        const attempt = await startAttempt('paper', 'user', 'photo');
        const first = await changeExamPages('paper', 'user', attempt.id, { kind: 'add', image: photoImage(80), expected: [] });
        const second = await changeExamPages('paper', 'user', attempt.id, { kind: 'add', image: photoImage(90), expected: first.pages });
        mocks.locate.mockImplementation(async (input: { image: string }) => input.image === photoImage(90)
            ? { pageReadable: reason !== 'unreadable', paperCode: reason === 'wrong_paper' ? 'ZZZZ' : '', answers: [] }
            : { pageReadable: true, paperCode: '', answers: [locatedAnswer(1)] });
        await submitAttempt('paper', 'user', attempt.id);
        await vi.waitFor(async () => expect(findRunningTask('user', gradingTarget(attempt.id))).toBeNull());
        const issue = await getAttempt('paper', 'user', attempt.id);
        expect(issue).toMatchObject({ status: 'answering', pageIssues: [{ index: 1, reason }] });
        expect(mocks.grade).not.toHaveBeenCalled();
        expect(await (await PENDING(request())).json()).toContainEqual(expect.objectContaining({ id: attempt.id, status: 'answering' }));
        await changeExamPages('paper', 'user', attempt.id, { kind: 'replace', pages: [second.pages[0], photoImage(100)], expected: second.pages });
        mocks.locate.mockResolvedValue({ pageReadable: true, paperCode: '', answers: [locatedAnswer(2, 'none', false)] });
        await submitAttempt('paper', 'user', attempt.id);
        const graded = await awaitGraded(attempt.id);
        expect(mocks.locate).toHaveBeenCalledTimes(3);
        expect(mocks.grade).toHaveBeenCalledTimes(1);
        expect(graded.answers.find(answer => answer.examQuestionId === 'q2')).toMatchObject({ aiResult: 'unknown', aiReason: 'EXAM_ANSWER_UNREADABLE' });
        expect(await db.aiUsage.count({ where: { userId: 'user', kind: 'exam-grade' } })).toBe(1);
        const refs = JSON.parse((await db.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).pageImages!) as string[];
        await deleteAttempt('paper', 'user', attempt.id);
        expect(refs.every(ref => !existsSync(localImagePath(ref)))).toBe(true);
    });
});


describe('拍照任务恢复与并发保护', () => {
    it('定位失败保留成功页与额度，再次交卷可恢复，定位并发最多三页', async () => {
        await db.user.update({ where: { id: 'user' }, data: { aiDataConsentAt: new Date() } });
        const attempt = await startAttempt('paper', 'user', 'photo');
        let pages: string[] = [];
        for (let i = 0; i < 8; i++) pages = (await changeExamPages('paper', 'user', attempt.id, { kind: 'add', image: photoImage(110 + i), expected: pages })).pages;
        let active = 0, maximum = 0;
        let fail = true;
        mocks.locate.mockImplementation(async (input: { image: string }) => {
            maximum = Math.max(maximum, ++active);
            await new Promise(resolve => setTimeout(resolve, 5));
            active--;
            if (fail && input.image === photoImage(111)) throw new Error('offline');
            return { pageReadable: true, paperCode: '', answers: [] };
        });
        await submitAttempt('paper', 'user', attempt.id);
        await vi.waitFor(async () => expect(findRunningTask('user', gradingTarget(attempt.id))).toBeNull());
        // 读取接口前已落盘，定位失败不依赖 GET 的通用恢复。
        expect(await db.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({ status: 'answering', pageIssues: JSON.stringify([{ index: -1, reason: 'locate_failed' }]) });
        expect((await getAttempt('paper', 'user', attempt.id))).toMatchObject({ status: 'answering', pageIssues: [{ index: -1, reason: 'locate_failed' }] });
        expect(maximum).toBeLessThanOrEqual(3);
        const succeeded = JSON.parse((await db.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).pageLocations!).length;
        const calls = mocks.locate.mock.calls.length;
        fail = false;
        await submitAttempt('paper', 'user', attempt.id);
        await awaitGraded(attempt.id);
        expect(mocks.locate).toHaveBeenCalledTimes(calls + 8 - succeeded);
        expect(await db.aiUsage.count({ where: { userId: 'user', kind: 'exam-grade' } })).toBe(1);
    });

    it.each(['unreadable', 'wrong_paper'])('强制交卷处理 %s，缓存不再定位、额度不重复计算', async reason => {
        mocks.dailyLimit = 1;
        await db.user.update({ where: { id: 'user' }, data: { aiDataConsentAt: new Date() } });
        const attempt = await startAttempt('paper', 'user', 'photo');
        const first = await changeExamPages('paper', 'user', attempt.id, { kind: 'add', image: photoImage(180), expected: [] });
        await changeExamPages('paper', 'user', attempt.id, { kind: 'add', image: photoImage(190), expected: first.pages });
        // 照片读取与定位并发执行，测试按图片匹配，避免依赖请求先后顺序。
        mocks.locate.mockImplementation(async (input: { image: string }) => input.image === photoImage(190)
            ? { pageReadable: reason !== 'unreadable', paperCode: reason === 'wrong_paper' ? 'ZZZZ' : '', answers: [locatedAnswer(2, 'correct')] }
            : { pageReadable: true, paperCode: '', answers: [locatedAnswer(1)] });
        await submitAttempt('paper', 'user', attempt.id);
        await vi.waitFor(() => expect(findRunningTask('user', gradingTarget(attempt.id))).toBeNull());
        expect((await getAttempt('paper', 'user', attempt.id)).pageIssues).toEqual([{ index: 1, reason }]);
        expect((await SUBMIT(request('POST', { force: 'true' }), context(attempt.id))).status).toBe(400);
        expect((await SUBMIT(request('POST', { force: true }), context(attempt.id))).status).toBe(200);
        const detail = await awaitGraded(attempt.id);
        expect(detail.pageIssues).toEqual([]);
        expect(mocks.locate).toHaveBeenCalledTimes(2);
        expect(mocks.grade).toHaveBeenCalledTimes(reason === 'unreadable' ? 1 : 2);
        expect(detail.answers.find(answer => answer.examQuestionId === 'q2')).toMatchObject(reason === 'unreadable'
            ? { aiReason: 'EXAM_ANSWER_NOT_FOUND', answerImageUrl: null, recognizedAnswer: null, handMark: null, finalResult: null }
            : { aiResult: 'wrong', handMark: 'correct', finalResult: 'correct' });
        expect(await db.aiUsage.count({ where: { kind: 'exam-grade' } })).toBe(1);
    });

    it.each(['online', 'manual', 'photo'] as const)('没有问题页的 %s 作答拒绝 force，手动入口也受状态限制', async kind => {
        const attempt = await startAttempt('paper', 'user', kind);
        expect((await SUBMIT(request('POST', { force: true }), context(attempt.id))).status).toBe(409);
        expect((await MANUAL(request('POST'), context(attempt.id))).status).toBe(409);
        expect(mocks.locate).not.toHaveBeenCalled();
        expect(await db.aiUsage.count()).toBe(0);
    });

    it('定位失败可转入手动待确认，全部还没判、照片可回看且无额外额度', async () => {
        await db.user.update({ where: { id: 'user' }, data: { aiDataConsentAt: new Date() } });
        const attempt = await startAttempt('paper', 'user', 'photo');
        const { pages } = await changeExamPages('paper', 'user', attempt.id, { kind: 'add', image: photoImage(200), expected: [] });
        mocks.locate.mockRejectedValue(new Error('provider error'));
        await submitAttempt('paper', 'user', attempt.id);
        await vi.waitFor(() => expect(findRunningTask('user', gradingTarget(attempt.id))).toBeNull());
        // 换页与排序不能清掉整卷失败的恢复入口。
        expect((await changeExamPages('paper', 'user', attempt.id, { kind: 'replace', pages, expected: pages })).issues).toEqual([{ index: -1, reason: 'locate_failed' }]);
        mocks.email = 'other@example.com';
        expect((await MANUAL(request('POST'), context(attempt.id))).status).toBe(404);
        mocks.email = 'attempt@example.com';
        const response = await MANUAL(request('POST'), context(attempt.id));
        expect(response.status).toBe(200);
        const detail = await response.json();
        expect(detail).toMatchObject({ status: 'reviewing', kind: 'photo', pages, pageIssues: [] });
        expect(detail.answers).toHaveLength(3);
        expect(detail.answers).toEqual(expect.arrayContaining(['q1', 'q2', 'q3'].map(examQuestionId => expect.objectContaining({ examQuestionId, aiResult: null, aiReason: null, finalResult: null, handMark: null }))));
        const indexCtx = { params: Promise.resolve({ id: 'paper', aid: attempt.id, index: '0' }) };
        expect((await PAGE_IMAGE(request(), indexCtx)).status).toBe(200);
        expect(await imageDataUrl(pages[0])).toBe(photoImage(200));
        expect((await MANUAL(request('POST'), context(attempt.id))).status).toBe(409);
        expect(mocks.grade).not.toHaveBeenCalled();
        expect(mocks.locate).toHaveBeenCalledOnce();
        expect(await db.aiUsage.count({ where: { kind: 'exam-grade' } })).toBe(1);
        await setFinalResult('paper', 'user', attempt.id, 'q1', 'correct');
        await setFinalResult('paper', 'user', attempt.id, 'q2', 'not_attempted');
        await confirmAttempt('paper', 'user', attempt.id);
        expect((await getAttempt('paper', 'user', attempt.id)).status).toBe('done');
        expect(await imageDataUrl(pages[0])).toBe(photoImage(200));
    });

    it('重放追加不会重复照片，旧删除引用不能删掉后一页', async () => {
        const attempt = await startAttempt('paper', 'user', 'photo');
        const operation = { kind: 'add' as const, image: photoImage(130), expected: [] };
        const first = await changeExamPages('paper', 'user', attempt.id, operation);
        expect((await changeExamPages('paper', 'user', attempt.id, operation)).pages).toEqual(first.pages);
        const second = await changeExamPages('paper', 'user', attempt.id, { kind: 'add', image: photoImage(140), expected: first.pages });
        await changeExamPages('paper', 'user', attempt.id, { kind: 'delete', index: 0, reference: first.pages[0] });
        await expect(changeExamPages('paper', 'user', attempt.id, { kind: 'delete', index: 0, reference: first.pages[0] })).rejects.toThrow('EXAM_ATTEMPT_INVALID_STATUS');
        expect((await getAttempt('paper', 'user', attempt.id)).pages).toEqual([second.pages[1]]);
    });
});


it('删除试卷时回收整页、展示图和临时判题图', async () => {
    const attempt = await startAttempt('paper', 'user', 'photo');
    const { pages } = await changeExamPages('paper', 'user', attempt.id, { kind: 'add', image: photoImage(150), expected: [] });
    const answer = await saveAnswer('paper', 'user', attempt.id, 'q1', { answerImage: photoImage(160), answerImages: [photoImage(170)] });
    expect((await DELETE_PAPER(request('DELETE'), { params: Promise.resolve({ id: 'paper' }) })).status).toBe(200);
    expect(await db.examAttempt.count()).toBe(0);
    for (const ref of [...pages, answer.answerImageUrl!, ...JSON.parse(answer.gradingImages!) as string[]]) {
        expect(existsSync(localImagePath(ref))).toBe(false);
    }
});
