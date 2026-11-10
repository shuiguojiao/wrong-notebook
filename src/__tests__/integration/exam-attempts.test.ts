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
}));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => mocks.email ? { user: { email: mocks.email }, expires: '2099-01-01' } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/mastery', async original => ({ ...(await original<typeof import('@/lib/mastery')>()), scheduleMasteryEvaluation: mocks.schedule }));

import { ANSWER_IMAGE } from '../fixtures/handwriting';
import { confirmAttempt, deleteAttempt, getAttempt, saveAnswer, setFinalResult, startAttempt, submitAttempt } from '@/lib/exam/exam-attempt';
import { imageDataUrl, localImagePath, storeImage } from '@/lib/image-storage';
import { pruneImages } from '@/lib/image-maintenance';
import { POST as START } from '@/app/api/exams/[id]/attempts/route';
import { GET, DELETE } from '@/app/api/exams/[id]/attempts/[aid]/route';
import { PUT, PATCH } from '@/app/api/exams/[id]/attempts/[aid]/answers/[questionId]/route';
import { GET as IMAGE } from '@/app/api/exams/[id]/attempts/[aid]/answers/[questionId]/image/route';
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
            const detail = await getAttempt('paper', 'user', attempt.id);
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
        const submitted = await submitAttempt('paper', 'user', attempt.id);
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
