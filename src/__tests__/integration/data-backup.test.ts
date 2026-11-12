// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import type { KnowledgeTag } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    prisma: undefined as PrismaClient | undefined,
    scheduleMasteryEvaluation: vi.fn(),
    warn: vi.fn(),
    session: { user: { id: 'user-1', email: 'backup-test@example.com', role: 'user' }, expires: '2099-01-01' },
}));

vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.prisma; } }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: mocks.warn, error: vi.fn() }) }));
vi.mock('@/lib/mastery', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/mastery')>()),
    scheduleMasteryEvaluation: mocks.scheduleMasteryEvaluation,
}));

import { ANSWER_IMAGE } from '../fixtures/handwriting';
import { GET as GET_RECORDS } from '@/app/api/error-items/[id]/practice-records/route';
import { imageDataUrl, isLocalImage, localImagePath, mapImageFields, storeImage } from '@/lib/image-storage';
import { migrateImages, pruneImages } from '@/lib/image-maintenance';
import { GET as EXPORT } from '@/app/api/export/route';
import { GET as GET_IMAGE, PUT as PUT_IMAGE } from '@/app/api/error-items/[id]/image/route';
import { DELETE as DELETE_ACCOUNT } from '@/app/api/user/route';
import { DELETE as DELETE_USER } from '@/app/api/admin/users/[id]/route';
import { GET as GET_ITEM } from '@/app/api/error-items/[id]/route';
import { GET as GET_LIST } from '@/app/api/error-items/list/route';
import { POST as EXPORT_QUESTIONS } from '@/app/api/error-items/export-questions/route';
import { importImportTasks } from '@/lib/import/import-task-backup';
import { POST as IMPORT } from '@/app/api/import/route';
import { sanitizeFigureSvg } from '@/lib/figure-svg';
import { embedNarration, sanitizeSvgAnimation } from '@/lib/svg-animation';
import { encodeMp3 } from '@/lib/tts/mp3';
import { seedChineseTags } from '@/lib/tags/seed';
import { POST as RECORD } from '@/app/api/practice/record/route';
import { GET as DUE } from '@/app/api/review/due/route';
import { rebuildReviewState, reviewPlanOf } from '@/lib/review-schedule';
import { syncReviewState } from '@/lib/review-state';
import { getAppTimeZone } from '@/lib/config';
import { shiftDay } from '@/lib/rewards/rules';
import { getRewardFunStickers, getRewardSummary, getRewardWeek, settleRewards } from '@/lib/rewards/service';
import { BACKUP_EXTENSIONS } from '@/lib/backup-extensions';
import type { BackupExtension } from '@/lib/backup-extensions';

let database: PrismaClient;
let directory: string;
const figure = sanitizeFigureSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>')!;
const animation = (text: string) => sanitizeSvgAnimation(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="1" y="5">${text}<animate attributeName="opacity" from="0" to="1" dur="1s"/></text></svg>`)!;
const lastPractice = JSON.stringify({ questionText: '新题', answerText: '答案', analysis: '解析', figureSvg: figure, difficulty: 'medium', generatedAt: '2026-10-20T00:00:00.000Z' });

async function exportBackup() {
    const response = await EXPORT(new Request('http://localhost/api/export'));
    expect(response.status).toBe(200);
    return response.json();
}

async function importBackup(body: object) {
    const response = await IMPORT(new Request('http://localhost/api/import', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    }));
    expect(response.status).toBe(200);
    return response.json();
}

/** 清空当前用户的学习数据（保留账户），模拟换机后导入 */
async function clearUserData() {
    await database.rewardEntry.deleteMany({ where: { userId: 'user-1' } });
    await database.problemReport.deleteMany({ where: { userId: 'user-1' } });
    await database.examPaper.deleteMany({ where: { userId: 'user-1' } });
    await database.errorItem.deleteMany({ where: { userId: 'user-1' } });
    await database.sourcePage.deleteMany({ where: { userId: 'user-1' } });
    await database.subject.deleteMany({ where: { userId: 'user-1' } });
    await database.knowledgeTag.deleteMany({ where: { userId: 'user-1' } });
    await database.knowledgeTag.deleteMany({ where: { isSystem: true } });
    await database.practiceRecord.deleteMany({ where: { userId: 'user-1' } });
    await database.importTask.deleteMany({ where: { userId: 'user-1' } });
    await database.importBatch.deleteMany({ where: { userId: 'user-1' } });
    await database.reviewSchedule.deleteMany();
    await database.paperGroup.deleteMany({ where: { userId: 'user-1' } });
}

beforeAll(() => {
    // 所有真实读写和迁移均使用系统临时数据库，不接触开发或生产数据。
    directory = mkdtempSync(join(tmpdir(), 'wrong-notebook-backup-test-'));
    // 云端语音缓存同样写到临时目录
    process.env.CONFIG_DIR = join(directory, 'config');
    const url = `file:${join(directory, 'test.db')}`;
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'pipe',
    });
    database = new PrismaClient({ datasources: { db: { url } } });
    mocks.prisma = database;
// 迁移通过子进程执行 Prisma CLI，CI 中与其他测试文件并行时较慢，留足时间
}, 120000);

beforeEach(async () => {
    mocks.scheduleMasteryEvaluation.mockClear();
    mocks.session.user.role = 'user';
    // 清理所有可能残留的数据（包括系统标签），确保每个测试从干净状态开始
    await database.reviewSchedule.deleteMany();
    await database.practiceRecord.deleteMany();
    await database.examPaper.deleteMany();
    await database.errorItem.deleteMany();
    await database.knowledgeTag.deleteMany();
    await database.subject.deleteMany();
    await database.user.deleteMany();
    await database.user.create({ data: { id: 'user-1', email: mocks.session.user.email, password: 'test-only' } });
    await database.subject.create({ data: { id: 'math', name: '数学', stage: 'junior_high', subjectKey: 'math', userId: 'user-1' } });
    await database.subject.create({ data: { id: 'math-cnm', name: '数学（课标）', stage: 'junior_high', subjectKey: 'math', tagSet: 'cn-math-taxonomy', userId: 'user-1' } });
    await database.knowledgeTag.create({ data: { id: 'tag-1', name: '自定义标签', subject: 'math', userId: 'user-1' } });
    await database.knowledgeTag.create({ data: { id: 'tag-2', name: '课标自定义', subject: 'math', tagSet: 'cn-math-taxonomy', userId: 'user-1' } });
    // 系统标签：default 和 cn-math-taxonomy 各一条同名，验证按 tagSet 区分
    await database.knowledgeTag.create({ data: { id: 'sys-default', name: '方程', subject: 'math', isSystem: true, tagSet: 'default' } });
    await database.knowledgeTag.create({ data: { id: 'sys-cnm', name: '方程', subject: 'math', isSystem: true, tagSet: 'cn-math-taxonomy' } });
    // 创建默认卷别分组，模拟真实数据结构
    await database.paperGroup.create({ data: { id: 'group-b', userId: 'user-1', key: 'b', name: 'B卷', order: 1 } });
    await database.errorItem.create({
        data: {
            id: 'item-1', shortId: 'AbC234', userId: 'user-1', subjectId: 'math', originalImageUrl: 'data:image/png;base64,dGVzdA==',
            questionText: '求解 x + 2 = 5', answerText: 'x = 3', analysis: '移项', wrongAnswerText: 'x = 7', mistakeAnalysis: '符号错误',
            mistakeStatus: 'wrong_attempt', source: '期中考试', errorType: '计算', userNotes: '注意符号', gradeSemester: '初二上',
            paperLevel: 'group-b', difficultyStars: 3, hasFigure: true, figureSvg: figure, figureScale: 65, figureAlign: 'left', answerSpacePx: 240,
            geogebraCommands: 'A=(0,0)\nB=(1,1)', svgAnimation: animation('中文'), svgAnimationEn: animation('English'), lastPractice,
            masteryLevel: 2, masteryProbability: 0.8, masteryReason: '连续答对', masterySource: 'ai', masteryEvaluatedAt: new Date('2026-10-21T00:00:00Z'),
            createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-21T00:00:00Z'),
            tags: { connect: [{ id: 'tag-1' }, { id: 'sys-default' }] },
        },
    });
    await database.errorItem.create({
        data: {
            id: 'item-2', shortId: 'XyZ789', userId: 'user-1', subjectId: 'math-cnm', originalImageUrl: 'data:image/png;base64,dGVzdA==',
            questionText: '求解 x + 3 = 7', answerText: 'x = 4', analysis: '移项',
            masteryLevel: 1,
            masteryProbability: 0.5, masteryEvaluatedAt: new Date('2026-10-22T00:00:00Z'),
            createdAt: new Date('2026-10-05T00:00:00Z'), updatedAt: new Date('2026-10-22T00:00:00Z'),
            tags: { connect: [{ id: 'tag-2' }, { id: 'sys-cnm' }] },
        },
    });
    await database.reviewSchedule.create({ data: { errorItemId: 'item-1', scheduledFor: new Date('2026-11-01T00:00:00Z') } });
    await database.practiceRecord.create({
        data: {
            userId: 'user-1', errorItemId: 'item-1', subject: 'math', difficulty: 'medium', isCorrect: true, result: 'correct',
            questionText: '变式题', answerText: 'x = 4', analysis: '同理', wrongAnswerText: 'x=4', notes: '先移项再相除', gradeReason: '答案正确，步骤完整', figureSvg: figure, source: 'practice',
            createdAt: new Date('2026-10-20T00:00:00Z'),
        },
    });
});

afterAll(async () => {
    delete process.env.CONFIG_DIR;
    await database?.$disconnect();
    if (directory) rmSync(directory, { recursive: true, force: true });
});

/** 两页、跨页多区域与共享出处，覆盖备份的关联映射。 */
async function createSources() {
    const image = 'data:image/png;base64,c291cmNlLXBhZ2U=';
    const reference = await storeImage(image);
    const secondReference = await storeImage('data:image/png;base64,c291cmNlLXBhZ2UtdHdv');
    for (const [id, imageUrl, pageNumber] of [['page-1', reference, 1], ['page-2', secondReference, 2]] as const) {
        const sha256 = imageUrl.slice('local-image:'.length, -4);
        await database.sourcePage.create({ data: { id, userId: 'user-1', sha256, imageUrl, width: 1200, height: 1800, origin: 'pdf', fileName: '试卷.pdf', pageNumber, createdAt: new Date('2026-11-01T00:00:00Z') } });
    }
    await database.questionRegion.createMany({ data: [
        { errorItemId: 'item-1', pageId: 'page-1', order: 0, x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
        { errorItemId: 'item-1', pageId: 'page-2', order: 1, x: 0, y: 0, width: 1, height: 0.2 },
        { errorItemId: 'item-2', pageId: 'page-1', order: 0, x: 0.5, y: 0.2, width: 0.4, height: 0.3 },
    ] });
    await database.errorItem.update({ where: { id: 'item-1' }, data: { checkStatus: 'flagged', checkIssues: JSON.stringify([{ code: 'text_diff', field: 'questionText', source: 'ai', visibility: 'user', severity: 'major', evidence: 'kěn', suggestion: { textSays: 'kě', imageSays: 'kěn' }, model: 'vision-model', dismissed: false }, { code: 'text_diff', field: 'questionText', source: 'ai', visibility: 'user', severity: 'major', resolved: true, suggestion: { textSays: '邻居', imageSays: '郊居' } }, { code: 'missing_figure', field: 'questionText', source: 'rules', visibility: 'user', severity: 'minor', dismissed: true }, { code: 'check_context', field: 'checkIssues', source: 'rules', visibility: 'agent', severity: 'minor', context: { origin: 'legacy', observedAt: '2026-11-02T00:00:00.000Z', deferredUntil: '2026-11-03T00:00:00.000Z', handling: [{ code: 'missing_figure', action: 'dismiss', at: '2026-11-02T01:00:00.000Z', durationMs: 5000 }] } }]), checkedAt: new Date('2026-11-02T00:00:00Z'), checkVersion: 1 } });
    return { image, reference };
}

describe('数据导出后再导入（真实 SQLite）', () => {
    it('第 17 版完整往返出处页、跨页区域、共享关联与检查记录，重复导入不新增出处', async () => {
        const { image } = await createSources();
        const ledger = JSON.stringify({ day: '2026-11-10', count: 2 });
        await database.user.update({ where: { id: 'user-1' }, data: { integritySurfaceLedger: ledger } });
        const backup = await exportBackup();
        expect(backup.user.integritySurfaceLedger).toBe(ledger);
        await database.user.update({ where: { id: 'user-1' }, data: { integritySurfaceLedger: null } });
        expect(backup.version).toBe(20);
        expect(backup.sourcePages).toHaveLength(2);
        expect(backup.questionRegions).toHaveLength(3);
        expect(backup.sourcePages[0].imageUrl).toBe(image);
        expect(JSON.stringify(backup)).not.toContain('local-image:');
        await clearUserData();
        // 换图片目录还原，验证图片确实由备份携带。
        const previous = process.env.IMAGE_STORAGE_DIR;
        process.env.IMAGE_STORAGE_DIR = join(directory, 'source-restored-images');
        try {
            await importBackup(backup);
            expect((await database.user.findUniqueOrThrow({ where: { id: 'user-1' } })).integritySurfaceLedger).toBe(ledger);
            const restored = await database.errorItem.findUniqueOrThrow({ where: { id: 'item-1' }, include: { questionRegions: { orderBy: { order: 'asc' }, include: { page: true } } } });
            expect(restored).toMatchObject({ checkStatus: 'flagged', checkIssues: backup.errorItems[0].checkIssues, checkedAt: new Date('2026-11-02T00:00:00Z'), checkVersion: 1 });
            expect(JSON.parse(restored.checkIssues!)).toContainEqual(expect.objectContaining({ code: 'text_diff', resolved: true }));
            expect(restored.questionRegions.map(region => [region.order, region.x, region.y, region.width, region.height, region.page.pageNumber])).toEqual([[0, 0.1, 0.2, 0.4, 0.3, 1], [1, 0, 0, 1, 0.2, 2]]);
            const page = restored.questionRegions[0].page;
            expect(page.id).not.toBe('page-1');
            expect(page).toMatchObject({ userId: 'user-1', fileName: '试卷.pdf', origin: 'pdf', width: 1200, height: 1800, createdAt: new Date('2026-11-01T00:00:00Z') });
            expect(await imageDataUrl(page.imageUrl)).toBe(image);
            expect((await database.questionRegion.findFirstOrThrow({ where: { errorItemId: 'item-2' } })).pageId).toBe(page.id);
            await database.user.update({ where: { id: 'user-1' }, data: { integritySurfaceLedger: JSON.stringify({ day: '2026-11-10', count: 3 }) } });
            await importBackup(backup);
            expect(JSON.parse((await database.user.findUniqueOrThrow({ where: { id: 'user-1' } })).integritySurfaceLedger!)).toEqual({ day: '2026-11-10', count: 3 });
            expect(await database.sourcePage.count()).toBe(2);
            expect(await database.questionRegion.count()).toBe(3);
        } finally {
            process.env.IMAGE_STORAGE_DIR = previous;
            // 后续清理测试仍需能读取库中引用。
            await storeImage(image);
        }
    });

    it('出处图片缺失时导出计数并留空，完整备份重复导入可修复文件', async () => {
        const { image, reference } = await createSources();
        const complete = await exportBackup();
        rmSync(localImagePath(reference));
        const partial = await exportBackup();
        expect(partial.missingImages).toBe(1);
        expect(partial.sourcePages.find((page: { id: string }) => page.id === 'page-1').imageUrl).toBe('');
        await importBackup(complete);
        expect(await imageDataUrl(reference)).toBe(image);
        expect(await database.sourcePage.count()).toBe(2);
        expect(await database.questionRegion.count()).toBe(3);
        await clearUserData();
        await importBackup(partial);
        expect((await database.sourcePage.findFirstOrThrow({ where: { pageNumber: 1 } })).imageUrl).toBe('');
        expect(await database.questionRegion.count()).toBe(3);
    });

    it('备份中的出处图片拒绝本机引用，失败后不新增任何出处', async () => {
        const { reference } = await createSources();
        const backup = await exportBackup();
        backup.sourcePages[0].imageUrl = reference;
        await clearUserData();
        const response = await IMPORT(new Request('http://localhost/api/import', { method: 'POST', body: JSON.stringify(backup) }));
        expect(response.status).toBe(400);
        expect(await database.sourcePage.count()).toBe(0);
        expect(await database.questionRegion.count()).toBe(0);
        expect(await database.errorItem.count()).toBe(0);
    });

    it('第 16 版无出处与检查字段的旧备份正常恢复为未检查', async () => {
        const backup = await exportBackup();
        backup.version = 16;
        delete backup.sourcePages;
        delete backup.questionRegions;
        for (const item of backup.errorItems) {
            for (const key of ['checkStatus', 'checkIssues', 'checkedAt', 'checkVersion']) delete item[key];
        }
        await clearUserData();
        await importBackup(backup);
        expect(await database.sourcePage.count()).toBe(0);
        expect(await database.questionRegion.count()).toBe(0);
        expect(await database.errorItem.findUniqueOrThrow({ where: { id: 'item-1' } })).toMatchObject({ checkStatus: null, checkIssues: null, checkedAt: null, checkVersion: null });
    });

    it('出处页按用户隔离导出，跨账户恢复安全映射且不重复创建', async () => {
        await createSources();
        const backup = await exportBackup();
        await database.user.create({ data: { id: 'source-other', email: 'source-other@example.com', password: 'test-only' } });
        // 测试管理员全量导入的另一用户，保留原 ID 碰撞以验证映射。
        backup.sourcePages.forEach((page: { userId: string }) => { page.userId = 'source-other'; });
        backup.errorItems.forEach((item: { userId: string; subjectId: string | null }) => { item.userId = 'source-other'; item.subjectId = null; });
        backup.subjects = []; backup.customTags = []; backup.paperGroups = [];
        backup.practiceRecords = []; backup.reviewSchedules = [];
        await database.user.update({ where: { id: 'user-1' }, data: { role: 'admin' } });
        const response = await IMPORT(new Request('http://localhost/api/import?all=true', { method: 'POST', body: JSON.stringify(backup) }));
        expect(response.status).toBe(200);
        const repeated = await IMPORT(new Request('http://localhost/api/import?all=true', { method: 'POST', body: JSON.stringify(backup) }));
        expect(repeated.status).toBe(200);
        const pages = await database.sourcePage.findMany({ where: { userId: 'source-other' } });
        expect(pages).toHaveLength(2);
        expect(pages.map(page => page.id)).not.toContain('page-1');
        expect(await database.questionRegion.count({ where: { errorItem: { userId: 'source-other' } } })).toBe(3);
        mocks.session.user.role = 'user';
        expect((await exportBackup()).sourcePages.every((page: { userId: string }) => page.userId === 'user-1')).toBe(true);
        expect(await database.sourcePage.count({ where: { userId: 'user-1' } })).toBe(2);
    });

    it('图片维护保留有效出处图片，迁移可重复执行，删题后清理孤儿出处', async () => {
        const { image, reference } = await createSources();
        await database.sourcePage.update({ where: { id: 'page-1' }, data: { imageUrl: image } });
        expect((await migrateImages(database)).changed).toBeGreaterThanOrEqual(1);
        expect((await migrateImages(database)).changed).toBe(0);
        await pruneImages(database, true);
        expect(await imageDataUrl(reference)).toBe(image);
        await database.errorItem.deleteMany();
        await pruneImages(database);
        expect(await database.sourcePage.count()).toBe(2);
        expect(await imageDataUrl(reference)).toBe(image);
        await pruneImages(database, true);
        expect(await database.sourcePage.count()).toBe(0);
        await expect(imageDataUrl(reference)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('引用中的出处页禁止删除，删题级联清理区域并保留共用出处', async () => {
        await createSources();
        await expect(database.sourcePage.delete({ where: { id: 'page-1' } })).rejects.toMatchObject({ code: 'P2003' });
        await database.errorItem.delete({ where: { id: 'item-1' } });
        expect(await database.questionRegion.count()).toBe(1);
        expect(await database.sourcePage.count()).toBe(2);
        expect((await database.questionRegion.findFirstOrThrow()).errorItemId).toBe('item-2');
    });

    it('用户自助注销通过真实接口级联删除出处页与区域', async () => {
        await createSources();
        await database.user.update({ where: { id: 'user-1' }, data: { password: await hash('test-password', 4) } });
        const response = await DELETE_ACCOUNT(new Request('http://localhost/api/user', { method: 'DELETE', body: JSON.stringify({ password: 'test-password' }) }));
        expect(response.status).toBe(200);
        expect(await database.sourcePage.count()).toBe(0);
        expect(await database.questionRegion.count()).toBe(0);
        expect(await database.errorItem.count()).toBe(0);
    });

    it('管理员删用户级联删除出处与区域，保留管理员自己的出处', async () => {
        await createSources();
        await database.user.create({ data: { id: 'source-victim', email: 'victim@example.com', password: 'test-only' } });
        await database.errorItem.create({ data: { id: 'victim-item', userId: 'source-victim', originalImageUrl: '' } });
        await database.sourcePage.create({ data: { id: 'victim-page', userId: 'source-victim', sha256: 'a'.repeat(64), imageUrl: '', width: 10, height: 10, origin: 'agent' } });
        await database.questionRegion.create({ data: { errorItemId: 'victim-item', pageId: 'victim-page', order: 0, x: 0, y: 0, width: 1, height: 1 } });
        await database.user.update({ where: { id: 'user-1' }, data: { role: 'admin' } });
        const response = await DELETE_USER(new Request('http://localhost/api/admin/users/source-victim', { method: 'DELETE' }), { params: Promise.resolve({ id: 'source-victim' }) });
        expect(response.status).toBe(200);
        expect(await database.sourcePage.count({ where: { userId: 'source-victim' } })).toBe(0);
        expect(await database.questionRegion.count({ where: { errorItemId: 'victim-item' } })).toBe(0);
        expect(await database.sourcePage.count({ where: { userId: 'user-1' } })).toBe(2);
    });

    it('第 16 版保留 confidence、手动调整和稳定 ID，缓存损坏时由历史重建', async () => {
        await database.$transaction(async tx => {
            await tx.errorItem.update({ where: { id: 'item-1' }, data: { reviewOverride: 'restart', reviewOverrideAt: new Date('2026-10-18T01:00:00Z') } });
            await tx.errorItem.update({ where: { id: 'item-2' }, data: { reviewOverride: 'completed', reviewOverrideAt: new Date('2026-10-18T01:00:00Z') } });
            await tx.practiceRecord.updateMany({ where: { errorItemId: 'item-1' }, data: { confidence: 'sure' } });
            await syncReviewState(tx, 'item-1'); await syncReviewState(tx, 'item-2');
        });
        const before = await database.errorItem.findMany({ orderBy: { id: 'asc' } });
        const backup = await exportBackup();
        expect(backup.version).toBe(20); expect(backup.practiceRecords[0].confidence).toBe('sure');
        expect(backup.errorItems[0]).toMatchObject({ reviewStage: 2, reviewWrongStreak: 0, reviewOverride: 'restart', reviewSyncedAt: expect.any(String) });
        const recordId = backup.practiceRecords[0].id;
        // 调度字段是缓存，导入时必须按记录重算，不能照抄错误的到期时间。
        backup.errorItems[0].reviewStage = 0; backup.errorItems[0].nextReviewAt = '2000-01-01T00:00:00.000Z';
        await clearUserData(); await importBackup(backup);
        for (const previous of before) {
            expect(await database.errorItem.findUniqueOrThrow({ where: { id: previous.id } })).toMatchObject({
                reviewStage: previous.reviewStage, reviewWrongStreak: previous.reviewWrongStreak, nextReviewAt: previous.nextReviewAt,
                reviewCompletedAt: previous.reviewCompletedAt, reviewOverride: previous.reviewOverride, reviewOverrideAt: previous.reviewOverrideAt,
                reviewSyncedAt: expect.any(Date),
            });
        }
        expect(await database.practiceRecord.findUniqueOrThrow({ where: { id: recordId } })).toMatchObject({ confidence: 'sure', errorItemId: 'item-1' });
    });

    it('第 16 版往返每日分钟数与复习用时，旧格式缺省恢复三十分钟', async () => {
        await database.user.update({ where: { id: 'user-1' }, data: { reviewDailyMinutes: 45 } });
        await database.practiceRecord.updateMany({ where: { errorItemId: 'item-1' }, data: { source: 'review', durationSec: 123 } });
        const backup = await exportBackup();
        expect(backup.version).toBe(20); expect(backup.user.reviewDailyMinutes).toBe(45);
        expect(backup.practiceRecords.find((record: { errorItemId?: string | null }) => record.errorItemId === 'item-1')).toMatchObject({ durationSec: 123, source: 'review' });
        await clearUserData(); await importBackup(backup);
        expect((await database.user.findUniqueOrThrow({ where: { id: 'user-1' } })).reviewDailyMinutes).toBe(45);
        expect(await database.practiceRecord.findFirstOrThrow({ where: { errorItemId: 'item-1' } })).toMatchObject({ durationSec: 123 });
        const old = await exportBackup(); old.version = 15; delete old.user.reviewDailyMinutes;
        for (const record of old.practiceRecords) delete record.durationSec;
        await clearUserData(); await importBackup(old);
        expect((await database.user.findUniqueOrThrow({ where: { id: 'user-1' } })).reviewDailyMinutes).toBe(30);
        expect((await database.practiceRecord.findFirstOrThrow()).durationSec).toBeNull();
    });

    it.each([1, 14, 15])('第 %i 版无 confidence 与调度数据时按不太确定重放', async version => {
        const backup = await exportBackup(); backup.version = version;
        for (const entry of backup.errorItems) {
            for (const key of ['reviewStage', 'reviewWrongStreak', 'nextReviewAt', 'reviewCompletedAt', 'reviewSyncedAt', 'reviewOverride', 'reviewOverrideAt']) delete entry[key];
        }
        for (const entry of backup.practiceRecords) delete entry.confidence;
        await clearUserData(); await importBackup(backup);
        const restored = await database.errorItem.findFirstOrThrow({ where: { questionText: '求解 x + 2 = 5' }, include: { subject: true, practiceRecords: true } });
        expect(restored.reviewStage).toBe(1); expect(restored.reviewWrongStreak).toBe(0); expect(restored.reviewSyncedAt).not.toBeNull();
        expect(restored).toMatchObject(rebuildReviewState(restored, restored.practiceRecords, [], getAppTimeZone()));
        const exported = await exportBackup(); expect(exported.version).toBe(20);
        expect(exported.practiceRecords[0].confidence).toBeNull();
    });

    it.each([{ confidence: 'guess' }, { confidence: 3 }, { durationSec: -1 }, { durationSec: 1.5 }, { durationSec: '10' }])('非法备份 confidence 或用时 拒绝且不写入 %j', async patch => {
        const backup = await exportBackup(); backup.practiceRecords[0] = { ...backup.practiceRecords[0], ...patch };
        const before = await database.practiceRecord.count();
        expect((await IMPORT(new Request('http://localhost/api/import', { method: 'POST', body: JSON.stringify(backup) }))).status).toBe(400);
        expect(await database.practiceRecord.count()).toBe(before);
    });

    it.each(['practice', 'review'])('手写 %s 记录落盘、鉴权读取、备份往返及清理保护', async source => {
        const response = await RECORD(new Request('http://localhost/api/practice/record', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ errorItemId: 'item-1', source, result: 'correct', answerImage: ANSWER_IMAGE,
                userAnswer: '补充说明', recognizedAnswer: 'x = 2\n两边相除', gradeReason: '步骤正确' }),
        }));
        expect(response.status).toBe(200);
        const saved = await response.json();
        const row = await database.practiceRecord.findUniqueOrThrow({ where: { id: saved.id } });
        expect(isLocalImage(row.answerImageUrl!)).toBe(true);
        expect(await imageDataUrl(row.answerImageUrl!)).toBe(ANSWER_IMAGE);
        expect(row).toMatchObject({ wrongAnswerText: '补充说明', recognizedAnswer: 'x = 2\n两边相除' });
        const context = { params: Promise.resolve({ id: 'item-1' }) };
        const history = await GET_RECORDS(new Request('http://localhost/api/error-items/item-1/practice-records'), context);
        const detail = (await history.json()).records.find((record: { id: string }) => record.id === row.id);
        expect(detail.answerImageUrl).toBe(`/api/error-items/item-1/image?record=${row.id}&field=answer`);
        expect(detail.recognizedAnswer).toBe(row.recognizedAnswer);
        const imageResponse = await GET_IMAGE(new Request(`http://localhost${detail.answerImageUrl}`), context);
        expect(imageResponse.status).toBe(200);
        expect(imageResponse.headers.get('content-type')).toBe('image/png');
        expect(Buffer.from(await imageResponse.arrayBuffer()).toString('base64')).toBe(ANSWER_IMAGE.split(',')[1]);
        await database.user.create({ data: { id: 'other-handwriting', email: 'other-handwriting@example.com', password: 'test-only' } });
        await database.practiceRecord.update({ where: { id: row.id }, data: { userId: 'other-handwriting' } });
        expect((await GET_IMAGE(new Request(`http://localhost${detail.answerImageUrl}`), context)).status).toBe(404);
        await database.practiceRecord.update({ where: { id: row.id }, data: { userId: 'user-1' } });
        await pruneImages(database, true);
        expect(await imageDataUrl(row.answerImageUrl!)).toBe(ANSWER_IMAGE);
        const backup = await exportBackup();
        expect(backup.version).toBe(20);
        expect(backup.practiceRecords.find((record: { id: string }) => record.id === row.id)).toMatchObject({ answerImageUrl: ANSWER_IMAGE, recognizedAnswer: row.recognizedAnswer });
        expect(JSON.stringify(backup)).not.toContain('local-image:');
        await clearUserData();
        await importBackup(backup);
        const restored = await database.practiceRecord.findFirstOrThrow({ where: { recognizedAnswer: row.recognizedAnswer } });
        expect(restored).toMatchObject({ source, wrongAnswerText: '补充说明', recognizedAnswer: row.recognizedAnswer });
        expect(await imageDataUrl(restored.answerImageUrl!)).toBe(ANSWER_IMAGE);
    });

    it('version 14 备份没有手写字段时恢复为空值', async () => {
        const backup = await exportBackup(); backup.version = 14;
        for (const record of backup.practiceRecords) { delete record.answerImageUrl; delete record.recognizedAnswer; }
        await clearUserData(); await importBackup(backup);
        expect(await database.practiceRecord.findFirstOrThrow()).toMatchObject({ answerImageUrl: null, recognizedAnswer: null });
    });

    it.each(['local-image:abc.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8='])('记录接口拒绝无效手写图片 %s', async answerImage => {
        const before = await database.practiceRecord.count();
        const response = await RECORD(new Request('http://localhost/api/practice/record', { method: 'POST',
            body: JSON.stringify({ errorItemId: 'item-1', source: 'review', result: 'correct', answerImage }) }));
        expect(response.status).toBe(400);
        expect(await database.practiceRecord.count()).toBe(before);
    });

    it('备份拒绝非可移植手写引用和非法转写字段', async () => {
        const backup = await exportBackup();
        for (const patch of [{ answerImageUrl: 'local-image:abc.png' }, { recognizedAnswer: { malicious: true } }]) {
            const response = await IMPORT(new Request('http://localhost/api/import', { method: 'POST', body: JSON.stringify({ ...backup,
                practiceRecords: [{ ...backup.practiceRecords[0], ...patch }] }) }));
            expect(response.status).toBe(400);
        }
    });

    it('第 14 版还原问题反馈、快照及状态，重映射错题 ID，孤立关联置空', async () => {
        const snapshot = JSON.stringify({ questionText: '快照题干', answerText: '答案', analysis: '解析', knowledgePoints: ['方程'], subject: '数学', gradeSemester: '初二上', source: '期中', entryMethod: 'image', hasOriginalImage: true, aiProvider: 'openai', aiModel: 'actual-model' });
        await database.problemReport.create({ data: { id: 'report-1', userId: 'user-1', errorItemId: 'item-1', category: 'analysis', description: '解析问题', snapshot, status: 'resolved', adminNote: '已处理', createdAt: new Date('2026-11-01T12:00:00Z'), updatedAt: new Date('2026-11-02T12:00:00Z') } });
        await database.problemReport.create({ data: { id: 'report-2', userId: 'user-1', errorItemId: null, category: 'figure', description: '原题已删除', snapshot, status: 'wontfix', adminNote: '保留说明' } });
        const backup = await exportBackup();
        expect(backup.version).toBe(20); expect(backup.problemReports).toHaveLength(2);
        backup.version = 14; // 明确验证旧版 ID 重映射，当前版本空库恢复保留稳定 ID。
        backup.problemReports[1].errorItemId = 'missing-item';
        await clearUserData();
        const result = await importBackup(backup);
        expect(result.stats.problemReportsCreated).toBe(2);
        const linked = await database.problemReport.findFirstOrThrow({ where: { description: '解析问题' } });
        expect(linked.errorItemId).not.toBe('item-1'); expect(linked.errorItemId).not.toBeNull();
        expect(await database.errorItem.findUniqueOrThrow({ where: { id: linked.errorItemId! } })).toMatchObject({ questionText: '求解 x + 2 = 5', userId: 'user-1' });
        expect(linked).toMatchObject({ snapshot, status: 'resolved', adminNote: '已处理', createdAt: new Date('2026-11-01T12:00:00Z'), updatedAt: new Date('2026-11-02T12:00:00Z') });
        expect(await database.problemReport.findFirstOrThrow({ where: { description: '原题已删除' } })).toMatchObject({ errorItemId: null, status: 'wontfix', adminNote: '保留说明' });
    });

    it('第 13 版没有反馈时跳过，非法反馈拒绝整笔导入', async () => {
        await importBackup({ version: 13, user: { email: mocks.session.user.email }, errorItems: [] });
        expect(await database.problemReport.count()).toBe(0);
        const backup = await exportBackup();
        const response = await IMPORT(new Request('http://localhost/api/import', { method: 'POST', body: JSON.stringify({ ...backup, problemReports: [{ category: 'bad' }] }) }));
        expect(response.status).toBe(400);
        expect(await database.errorItem.count()).toBe(2);
    });

    it('运维 AI 用量不导出，导入也不覆盖本机用量', async () => {
        const row = await database.aiUsage.create({ data: { userId: 'user-1', kind: 'analyze', provider: 'openai', model: 'test', inputTokens: 11, outputTokens: 5 } });
        const backup = await exportBackup();
        expect(backup).not.toHaveProperty('aiUsages');
        expect(backup).not.toHaveProperty('aiUsage');
        await importBackup({ ...backup, aiUsages: [{ ...row, inputTokens: 999 }] });
        expect(await database.aiUsage.findUnique({ where: { id: row.id } })).toMatchObject({ inputTokens: 11, outputTokens: 5 });
    });
    it('第 13 版完整还原提醒设置与凭据，保留当天发送账本', async () => {
        const reminder = { reminderEnabled: true, reminderChannel: 'bark', reminderCredential: 'backup-private-key', reminderTime: '20:30', reminderLastSentAt: new Date('2026-11-05T12:30:00Z'), reminderLastResult: 'accepted' };
        await database.user.update({ where: { id: 'user-1' }, data: reminder });
        const backup = await exportBackup();
        expect(backup.user).toMatchObject({ ...reminder, reminderLastSentAt: reminder.reminderLastSentAt.toISOString() });
        await database.user.update({ where: { id: 'user-1' }, data: { reminderEnabled: false, reminderCredential: null, reminderTime: '09:00', reminderDay: '2026-11-05', reminderCompletedDay: '2026-11-05', reminderAttempts: 1 } });
        await importBackup(backup);
        expect(await database.user.findUniqueOrThrow({ where: { id: 'user-1' } })).toMatchObject({ ...reminder, reminderDay: '2026-11-05', reminderCompletedDay: '2026-11-05', reminderAttempts: 1 });
    });

    it('旧版备份缺少提醒字段时关闭提醒，不重置当天发送记录', async () => {
        await database.user.update({ where: { id: 'user-1' }, data: { reminderEnabled: true, reminderChannel: 'bark', reminderCredential: 'existing-key', reminderCompletedDay: '2026-11-05' } });
        await importBackup({ version: 12, user: { email: mocks.session.user.email }, errorItems: [] });
        expect(await database.user.findUniqueOrThrow({ where: { id: 'user-1' } })).toMatchObject({ reminderEnabled: false, reminderCompletedDay: '2026-11-05' });
    });

    it('拒绝非法提醒字段，导入不能绕过设置类型校验', async () => {
        const backup = await exportBackup();
        backup.user.reminderTime = '29:00';
        const response = await IMPORT(new Request('http://localhost/api/import', { method: 'POST', body: JSON.stringify(backup) }));
        expect(response.status).toBe(400);
    });
    it.each([false, true])('缺图和损坏图片不阻断备份和恢复（全量：%s）', async (all) => {
        const previous = process.env.IMAGE_STORAGE_DIR;
        process.env.IMAGE_STORAGE_DIR = join(directory, `damaged-images-${all}`);
        mocks.warn.mockClear();
        try {
            if (all) await database.user.update({ where: { id: 'user-1' }, data: { role: 'admin' } });
            const missing = await storeImage('data:image/png;base64,bWlzc2luZw==');
            const corrupt = await storeImage('data:image/png;base64,Y29ycnVwdA==');
            const intact = 'data:image/png;base64,aW50YWN0';
            const intactRef = await storeImage(intact);
            await database.errorItem.update({ where: { id: 'item-1' }, data: { originalImageUrl: missing } });
            await database.errorItem.update({ where: { id: 'item-2' }, data: { originalImageUrl: corrupt } });
            const record = await database.practiceRecord.findFirstOrThrow();
            await database.practiceRecord.update({ where: { id: record.id }, data: { originalImageUrl: intactRef } });
            const task = await database.importTask.create({ data: { userId: 'user-1', mode: 'review', status: 'failed', imageData: missing } });
            const batch = await database.importBatch.create({ data: { userId: 'user-1', source: 'text', splitter: 'local', draft: JSON.stringify({ items: [{ image: corrupt }] }) } });
            rmSync(localImagePath(missing));
            writeFileSync(localImagePath(corrupt), '已损坏');

            const response = await EXPORT(new Request(`http://localhost/api/export${all ? '?all=true' : ''}`));
            expect(response.status).toBe(200);
            expect(response.headers.get('X-Missing-Images')).toBe('4');
            const backup = await response.json();
            expect(backup.version).toBe(20);
            expect(backup.missingImages).toBe(4);
            expect(backup.errorItems).toEqual(expect.arrayContaining([
                expect.objectContaining({ id: 'item-1', originalImageUrl: '', questionText: '求解 x + 2 = 5' }),
                expect.objectContaining({ id: 'item-2', originalImageUrl: '' }),
            ]));
            expect(backup.practiceRecords[0].originalImageUrl).toBe(intact);
            expect(backup.importTasks[0].imageData).toBe('');
            expect(JSON.parse(backup.importBatches[0].draft).items[0].image).toBe('');
            expect(JSON.stringify(backup)).not.toContain('local-image:');
            expect(mocks.warn.mock.calls).toEqual(expect.arrayContaining([
                [{ recordId: 'item-1', field: 'originalImageUrl', code: 'ENOENT' }, expect.any(String)],
                [{ recordId: 'item-2', field: 'originalImageUrl', code: 'IMAGE_CHECKSUM_MISMATCH' }, expect.any(String)],
                [{ recordId: task.id, field: 'imageData', code: 'ENOENT' }, expect.any(String)],
                [{ recordId: batch.id, field: 'image', code: 'IMAGE_CHECKSUM_MISMATCH' }, expect.any(String)],
            ]));
            expect(mocks.warn).toHaveBeenCalledTimes(4);

            const questions = await EXPORT_QUESTIONS(new Request('http://localhost/api/error-items/export-questions', {
                method: 'POST', body: JSON.stringify({ ids: ['item-1', 'item-2'], includeImages: true }),
            }));
            expect(questions.status).toBe(200);
            expect(questions.headers.get('X-Missing-Images')).toBe('2');
            const questionFile = await questions.json();
            expect(questionFile.questions).toHaveLength(2);
            expect(questionFile.questions.every((question: { images?: unknown }) => !question.images)).toBe(true);

            await clearUserData();
            await importBackup(backup);
            const restored = await exportBackup();
            expect(restored.errorItems).toHaveLength(2);
            expect(restored.errorItems.every((item: { originalImageUrl: string }) => item.originalImageUrl === '')).toBe(true);
            expect(restored.practiceRecords[0].originalImageUrl).toBe(intact);
            expect(restored).not.toHaveProperty('missingImages');
        } finally {
            if (previous === undefined) delete process.env.IMAGE_STORAGE_DIR;
            else process.env.IMAGE_STORAGE_DIR = previous;
        }
    });

    it('数据库异常和非法图片引用仍然使导出失败', async () => {
        const spy = vi.spyOn(database.errorItem, 'findMany').mockRejectedValueOnce(new Error('数据库故障'));
        try {
            expect((await EXPORT(new Request('http://localhost/api/export'))).status).toBe(500);
        } finally {
            spy.mockRestore();
        }
        await database.errorItem.update({ where: { id: 'item-1' }, data: { originalImageUrl: 'local-image:invalid' } });
        expect((await EXPORT(new Request('http://localhost/api/export'))).status).toBe(500);
        expect((await EXPORT_QUESTIONS(new Request('http://localhost/api/error-items/export-questions', {
            method: 'POST', body: JSON.stringify({ ids: ['item-1'], includeImages: true }),
        }))).status).toBe(500);
    });

    it('旧图片迁移后可鉴权读取，并能仅凭旧格式 JSON 在新目录恢复全部图片', async () => {
        const image = 'data:image/png;base64,dGVzdA==';
        const original = await database.errorItem.findUniqueOrThrow({ where: { id: 'item-1' } });
        await database.practiceRecord.updateMany({ data: { originalImageUrl: image } });
        await database.importTask.create({ data: { userId: 'user-1', mode: 'review', status: 'review', imageData: image } });
        const draft = JSON.stringify({ items: [{ key: 'q1', text: '草稿', label: null, material: null, section: null, selected: true, regions: [], hasFigure: false, flags: [], image }], ignored: [], warnings: [] });
        await database.importBatch.create({ data: { userId: 'user-1', source: 'text', splitter: 'local', imageData: image, draft } });
        expect((await migrateImages(database)).changed).toBe(6);
        expect((await migrateImages(database)).changed).toBe(0);
        const migrated = await database.errorItem.findUniqueOrThrow({ where: { id: 'item-1' } });
        expect(isLocalImage(migrated.originalImageUrl)).toBe(true);
        expect(migrated.updatedAt).toEqual(original.updatedAt);
        const request = new Request('http://localhost/api/error-items/item-1/image');
        const context = { params: Promise.resolve({ id: 'item-1' }) };
        const response = await GET_IMAGE(request, context);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from('test'));
        const detail = await GET_ITEM(request, context);
        expect((await detail.json()).originalImageUrl).toMatch(/^\/api\/error-items\/item-1\/image\?v=/);
        const printed = await GET_LIST(new Request('http://localhost/api/error-items/list?view=print'));
        expect(printed.status).toBe(200);
        expect((await printed.json()).items[0].originalImageUrl).toMatch(/^\/api\/error-items\/.+\/image\?v=/);
        const exchanged = await EXPORT_QUESTIONS(new Request('http://localhost/api/error-items/export-questions', {
            method: 'POST', body: JSON.stringify({ ids: ['item-1'], includeImages: true }),
        }));
        expect(exchanged.status).toBe(200);
        expect((await exchanged.json()).questions[0].images[0].dataUrl).toBe(image);
        const record = await database.practiceRecord.findFirstOrThrow({ where: { errorItemId: 'item-1' } });
        const recordImage = await GET_IMAGE(new Request(`http://localhost/api/error-items/item-1/image?record=${record.id}`), context);
        expect(recordImage.status).toBe(200);
        expect(Buffer.from(await recordImage.arrayBuffer())).toEqual(Buffer.from('test'));
        await database.user.create({ data: { id: 'other-user', email: 'other-images@example.com', password: 'test-only' } });
        await database.errorItem.create({ data: { id: 'other-item', userId: 'other-user', originalImageUrl: migrated.originalImageUrl } });
        expect((await GET_IMAGE(request, { params: Promise.resolve({ id: 'other-item' }) })).status).toBe(404);
        const backup = await exportBackup();
        expect(JSON.stringify(backup)).not.toContain('local-image:');
        expect(backup.errorItems[0].originalImageUrl).toBe(image);
        expect(backup.importTasks[0].imageData).toBe(image);
        expect(JSON.parse(backup.importBatches[0].draft).items[0].image).toBe(image);
        await clearUserData();
        const previous = process.env.IMAGE_STORAGE_DIR;
        process.env.IMAGE_STORAGE_DIR = join(directory, 'restored-images');
        try {
            await importBackup(backup);
            const restored = await database.errorItem.findFirstOrThrow({ where: { userId: 'user-1', questionText: '求解 x + 2 = 5' } });
            expect(isLocalImage(restored.originalImageUrl)).toBe(true);
            expect(await imageDataUrl(restored.originalImageUrl)).toBe(image);
            expect(await exportBackup()).toMatchObject({ errorItems: expect.arrayContaining([expect.objectContaining({ originalImageUrl: image })]) });
        } finally {
            process.env.IMAGE_STORAGE_DIR = previous;
        }
    });

    it('清理仅移除无引用文件，共享原图和失败事务遗留的文件分别处理', async () => {
        const referenced = await storeImage('data:image/png;base64,c2hhcmVk');
        const orphan = await storeImage('data:image/png;base64,b3JwaGFu');
        await expect(database.$transaction(async (tx) => {
            await tx.errorItem.create({ data: { userId: 'user-1', originalImageUrl: orphan } });
            throw new Error('模拟事务失败');
        })).rejects.toThrow('模拟事务失败');
        await database.errorItem.updateMany({ data: { originalImageUrl: referenced } });
        await database.errorItem.delete({ where: { id: 'item-2' } });
        const preview = await pruneImages(database);
        expect(preview.unreferenced).toBeGreaterThanOrEqual(1);
        expect(preview.removed).toBe(0);
        expect(await imageDataUrl(orphan)).toBe('data:image/png;base64,b3JwaGFu');
        expect((await pruneImages(database, true)).removed).toBe(preview.unreferenced);
        expect(await imageDataUrl(referenced)).toBe('data:image/png;base64,c2hhcmVk');
        await expect(imageDataUrl(orphan)).rejects.toMatchObject({ code: 'ENOENT' });
        const nextOrphan = await storeImage('data:image/png;base64,bmV4dC1vcnBoYW4=');
        rmSync(localImagePath(referenced));
        await expect(pruneImages(database, true)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await imageDataUrl(nextOrphan)).toBe('data:image/png;base64,bmV4dC1vcnBoYW4=');
    });

    it('替换图片写入文件且使用新缓存地址，旧格式原图仍可读取', async () => {
        const context = { params: Promise.resolve({ id: 'item-1' }) };
        const request = new Request('http://localhost/api/error-items/item-1/image');
        expect((await GET_IMAGE(request, context)).status).toBe(200);
        const updated = await PUT_IMAGE(new Request(request, { method: 'PUT', body: JSON.stringify({ imageDataUrl: 'data:image/png;base64,bmV3' }) }), context);
        expect(updated.status).toBe(200);
        expect((await updated.json()).originalImageUrl).toMatch(/^\/api\/error-items\/item-1\/image\?v=/);
        const row = await database.errorItem.findUniqueOrThrow({ where: { id: 'item-1' } });
        expect(isLocalImage(row.originalImageUrl)).toBe(true);
        expect(localImagePath(row.originalImageUrl)).toContain('images');
        expect(Buffer.from(await (await GET_IMAGE(request, context)).arrayBuffer()).toString()).toBe('new');
    });

    it('图片目录无法写入时不改变原题，备份不能引用本机图片文件', async () => {
        const original = await database.errorItem.findUniqueOrThrow({ where: { id: 'item-1' } });
        const previous = process.env.IMAGE_STORAGE_DIR;
        process.env.IMAGE_STORAGE_DIR = join(directory, 'test.db');
        try {
            const response = await PUT_IMAGE(new Request('http://localhost/api/error-items/item-1/image', {
                method: 'PUT', body: JSON.stringify({ imageDataUrl: 'data:image/png;base64,d3JpdGUtZmFpbA==' }),
            }), { params: Promise.resolve({ id: 'item-1' }) });
            expect(response.status).toBe(500);
            expect(await database.errorItem.findUniqueOrThrow({ where: { id: 'item-1' } })).toEqual(original);
        } finally {
            process.env.IMAGE_STORAGE_DIR = previous;
        }
        const backup = await exportBackup();
        backup.errorItems[0].originalImageUrl = await storeImage(original.originalImageUrl);
        const rejected = await IMPORT(new Request('http://localhost/api/import', { method: 'POST', body: JSON.stringify(backup) }));
        expect(rejected.status).toBe(400);
        expect(await database.errorItem.count()).toBe(2);
    });

    it('禁用账号的旧会话不能导出或导入备份', async () => {
        const backup = await exportBackup();
        await database.user.update({ where: { id: 'user-1' }, data: { isActive: false } });
        expect((await EXPORT(new Request('http://localhost/api/export'))).status).toBe(403);
        expect((await IMPORT(new Request('http://localhost/api/import', { method: 'POST', body: JSON.stringify(backup) }))).status).toBe(403);
    });

    it('完整语文课程备份往返保留同名章节的层级及题目关联，兼容乱序与重复导入', async () => {
        await seedChineseTags(database);
        const scope = { subject: 'chinese', isSystem: true, tagSet: 'default' };
        const before = await database.knowledgeTag.findMany({ where: scope });
        function hierarchy(tags: KnowledgeTag[]) {
            const byId = new Map(tags.map((tag) => [tag.id, tag]));
            const path = (tag: KnowledgeTag): string => {
                const parent = tag.parentId ? byId.get(tag.parentId) : undefined;
                return parent ? `${path(parent)}/${tag.name}` : tag.name;
            };
            return tags.map((tag) => `${tag.tagSet}:${tag.subject}:${path(tag)}:${tag.order}:${tag.code}`).sort();
        }
        const grade = before.find((tag) => tag.name === '四年级' && tag.parentId === null)!;
        const chapter = before.find((tag) => tag.name === '句子' && tag.parentId === grade.id)!;
        const leaf = before.find((tag) => tag.name === '修改病句' && tag.parentId === chapter.id)!;
        await database.subject.create({ data: { id: 'chinese', name: '小学语文', stage: 'primary', subjectKey: 'chinese', userId: 'user-1' } });
        await database.knowledgeTag.create({ data: { id: 'custom-chinese', name: '我的句式笔记', subject: 'chinese', parentId: chapter.id, userId: 'user-1' } });
        await database.errorItem.update({
            where: { id: 'item-1' },
            data: { subjectId: 'chinese', tags: { set: [{ id: leaf.id }, { id: 'custom-chinese' }] } },
        });
        const backup = await exportBackup();
        // 旧版或外部整理过的备份可能先列出子节点。
        backup.systemTags.reverse();
        await clearUserData();
        await importBackup(backup);

        const restored = await database.knowledgeTag.findMany({ where: scope });
        expect(hierarchy(restored)).toEqual(hierarchy(before));
        const newGrade = restored.find((tag) => tag.name === '四年级' && tag.parentId === null)!;
        const newChapter = restored.find((tag) => tag.name === '句子' && tag.parentId === newGrade.id)!;
        const newLeaf = restored.find((tag) => tag.name === '修改病句' && tag.parentId === newChapter.id)!;
        expect(await database.knowledgeTag.findFirstOrThrow({ where: { name: '我的句式笔记' } })).toMatchObject({ parentId: newChapter.id });
        const item = await database.errorItem.findFirstOrThrow({ where: { shortId: 'AbC234' }, include: { tags: true, subject: true } });
        expect(item.subject).toMatchObject({ stage: 'primary', subjectKey: 'chinese' });
        expect(item.tags.find((tag) => tag.isSystem)?.id).toBe(newLeaf.id);
        expect(item.tags.map((tag) => tag.name).sort()).toEqual(['修改病句', '我的句式笔记']);

        await importBackup(backup);
        expect(hierarchy(await database.knowledgeTag.findMany({ where: scope }))).toEqual(hierarchy(before));
        expect(await database.knowledgeTag.count({ where: { name: '我的句式笔记' } })).toBe(1);
    });

    it('导出文件使用第 16 版格式，包含 tagSet 字段、空的 extensions 与试卷 mode', async () => {
        const backup = await exportBackup();
        expect(backup.version).toBe(20);
        expect(backup.extensions).toEqual({});
        expect(backup.paperGroups).toContainEqual(expect.objectContaining({ id: 'group-b', key: 'b', name: 'B卷' }));
        expect(backup.systemTags).toBeDefined();
        expect(backup.subjects).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'math', tagSet: 'default' }),
                expect.objectContaining({ id: 'math-cnm', tagSet: 'cn-math-taxonomy' }),
            ])
        );
        expect(backup.systemTags).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'sys-default', tagSet: 'default' }),
                expect.objectContaining({ id: 'sys-cnm', tagSet: 'cn-math-taxonomy' }),
            ])
        );
        expect(backup.customTags).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'tag-1', tagSet: 'default' }),
                expect.objectContaining({ id: 'tag-2', tagSet: 'cn-math-taxonomy' }),
            ])
        );
    });

    it('第 11 版备份缺少练习思路和判题依据时恢复为 null', async () => {
        const backup = await exportBackup();
        backup.version = 11;
        for (const record of backup.practiceRecords) { delete record.notes; delete record.gradeReason; }
        await clearUserData();
        await importBackup(backup);
        expect(await database.practiceRecord.findFirstOrThrow({ where: { userId: 'user-1' } })).toMatchObject({ notes: null, gradeReason: null, wrongAnswerText: 'x=4' });
    });

    it.each(['correct', 'wrong'])('原题复习 %s 影响到期列表，计划与算法一致且备份可往返', async (result) => {
        await database.practiceRecord.deleteMany();
        await database.errorItem.update({ where: { id: 'item-1' }, data: { createdAt: new Date('2020-01-01') } });
        const due = async () => (await (await DUE(new Request('http://localhost/api/review/due?format=ids'))).json()).items;
        expect(await due()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'item-1' })]));
        const response = await RECORD(new Request('http://localhost/api/practice/record', { method: 'POST', body: JSON.stringify({
            errorItemId: 'item-1', source: 'review', result, includeReviewPlan: true,
            userAnswer: '本次答案', notes: '本次思路', gradeReason: 'AI 判题依据',
            questionText: '伪造变式', answerText: '伪造答案', analysis: '伪造解析', difficulty: 'hard', figureSvg: figure,
        }) }));
        expect(response.status).toBe(200);
        const saved = await response.json();
        expect(saved).toMatchObject({ source: 'review', result, questionText: null, answerText: null, analysis: null, figureSvg: null, difficulty: null,
            wrongAnswerText: '本次答案', notes: '本次思路', gradeReason: 'AI 判题依据' });
        const item = await database.errorItem.findUniqueOrThrow({ where: { id: 'item-1' }, include: { practiceRecords: true } });
        expect(saved.reviewPlan).toEqual(JSON.parse(JSON.stringify(reviewPlanOf(rebuildReviewState({ ...item, subject: { name: '数学', subjectKey: 'math' } }, item.practiceRecords, [], getAppTimeZone())))));
        expect(await due()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'item-1' })]));
        const backup = await exportBackup();
        expect(backup.version).toBe(20);
        expect(backup.practiceRecords[0].source).toBe('review');
        await clearUserData();
        await importBackup(backup);
        expect(await database.practiceRecord.findFirstOrThrow()).toMatchObject({ source: 'review', result, wrongAnswerText: '本次答案',
            notes: '本次思路', gradeReason: 'AI 判题依据', questionText: null, answerText: null, analysis: null });
    });

    it.each([{ source: 'review', result: 'correct' }, { source: 'review', errorItemId: 'item-1', result: 'not_attempted' }])('拒绝缺少关联或对错结果的复习记录 %j', async (body) => {
        expect((await RECORD(new Request('http://localhost/api/practice/record', { method: 'POST', body: JSON.stringify(body) }))).status).toBe(400);
    });

    it('不能向他人的原题写入复习记录', async () => {
        await database.user.create({ data: { id: 'other', email: 'other@example.com', password: 'test-only' } });
        await database.errorItem.update({ where: { id: 'item-1' }, data: { userId: 'other' } });
        const count = await database.practiceRecord.count();
        const response = await RECORD(new Request('http://localhost/api/practice/record', { method: 'POST',
            body: JSON.stringify({ source: 'review', errorItemId: 'item-1', result: 'correct' }) }));
        expect(response.status).toBe(404);
        expect(await database.practiceRecord.count()).toBe(count);
    });

    it('错题与举一反三记录的全部字段完整保留，tagSet 正确还原', async () => {
        const backup = await exportBackup();
        await clearUserData();
        const { stats } = await importBackup(backup);
        expect(stats).toMatchObject({ errorItemsCreated: 2, practiceRecordsCreated: 1, reviewSchedulesCreated: 1, tagsLinked: 4 });

        const item = await database.errorItem.findFirstOrThrow({ where: { userId: 'user-1', shortId: 'AbC234' }, include: { tags: true, subject: true, paperGroup: true } });
        expect(item).toMatchObject({
            shortId: 'AbC234', questionText: '求解 x + 2 = 5', difficultyStars: 3, hasFigure: true, figureSvg: figure, figureScale: 65, figureAlign: 'left', answerSpacePx: 240,
            geogebraCommands: 'A=(0,0)\nB=(1,1)', svgAnimation: animation('中文'), svgAnimationEn: animation('English'), lastPractice,
            masteryProbability: 0.8, masteryReason: '连续答对', masterySource: 'ai', masteryEvaluatedAt: new Date('2026-10-21T00:00:00Z'),
            createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-21T00:00:00Z'),
        });
        expect(item.subject).toMatchObject({ name: '数学', stage: 'junior_high', subjectKey: 'math', tagSet: 'default' });
        expect(item.paperGroup).toMatchObject({ userId: 'user-1', key: 'b', name: 'B卷', order: 1, isActive: true });
        expect(item.tags.map((tag) => tag.name)).toEqual(['方程', '自定义标签']);

        // 课标体系的错题：tagSet 保留，系统标签按 tagSet 匹配
        const itemCnm = await database.errorItem.findFirstOrThrow({ where: { userId: 'user-1', shortId: 'XyZ789' }, include: { tags: true, subject: true } });
        expect(itemCnm.subject).toMatchObject({ name: '数学（课标）', tagSet: 'cn-math-taxonomy' });
        // 课标错题只应关联 cn-math-taxonomy 体系的"方程"标签，而非 default 体系的
        const cnmTag = itemCnm.tags.find((t) => t.name === '方程');
        expect(cnmTag?.tagSet).toBe('cn-math-taxonomy');
        expect(cnmTag?.id).not.toBe('sys-default');

        const record = await database.practiceRecord.findFirstOrThrow({ where: { errorItemId: item.id } });
        expect(record).toMatchObject({ result: 'correct', questionText: '变式题', wrongAnswerText: 'x=4', notes: '先移项再相除', gradeReason: '答案正确，步骤完整', figureSvg: figure, source: 'practice' });
        // 已带掌握概率导入，不重复评估
        expect(mocks.scheduleMasteryEvaluation).not.toHaveBeenCalled();
    });

    it.each([undefined, null, 0, 201, 50.5, '65'])('旧备份或非法配图比例 %s 回退为 100%%，非法配图位置回退为居中', async (figureScale) => {
        const backup = await exportBackup();
        backup.errorItems[0].figureScale = figureScale;
        backup.errorItems[0].figureAlign = 'invalid-align';
        await clearUserData();
        await importBackup(backup);
        const item = await database.errorItem.findFirstOrThrow({ where: { userId: 'user-1', questionText: '求解 x + 2 = 5' } });
        expect(item.figureScale).toBe(100);
        expect(item.figureAlign).toBe('center');
        expect(item.figureSvg).toBe(figure);
    });

    it('题型字段随备份往返，旧版文件没有该字段时导入为 null', async () => {
        await database.errorItem.update({ where: { id: 'item-1' }, data: { questionType: 'fill_blank' } });
        const backup = await exportBackup();
        const backupItem = backup.errorItems.find((item: { id: string }) => item.id === 'item-1');
        expect(backupItem.questionType).toBe('fill_blank');
        expect(backup.errorItems.find((item: { id: string }) => item.id === 'item-2').questionType ?? null).toBeNull();

        await clearUserData();
        await importBackup(backup);
        const restored = await database.errorItem.findFirstOrThrow({ where: { userId: 'user-1', shortId: 'AbC234' } });
        expect(restored.questionType).toBe('fill_blank');

        // 模拟旧版备份：去掉 questionType 字段
        const legacyBackup = await exportBackup();
        legacyBackup.version = 8;
        for (const item of legacyBackup.errorItems) {
            delete item.questionType;
        }
        await clearUserData();
        await importBackup(legacyBackup);
        const legacyItem = await database.errorItem.findFirstOrThrow({ where: { userId: 'user-1', shortId: 'AbC234' } });
        expect(legacyItem.questionType).toBeNull();
    });

    it.each([undefined, null, -1, 601, 50.5, '120'])('旧备份或非法单题留白 %s 导入为空，按全局留白档位', async (answerSpacePx) => {
        const backup = await exportBackup();
        expect(backup.errorItems.find((item: { id: string }) => item.id === 'item-1').answerSpacePx).toBe(240);
        backup.errorItems[0].answerSpacePx = answerSpacePx;
        backup.errorItems[1].answerSpacePx = answerSpacePx;
        await clearUserData();
        await importBackup(backup);
        const items = await database.errorItem.findMany({ where: { userId: 'user-1' } });
        expect(items.map((item) => item.answerSpacePx)).toEqual([null, null]);
    });

    it('旧版备份（version 2，无 tagSet 字段）导入时按 default tagSet 处理', async () => {
        const backup = await exportBackup();
        // 模拟旧版导出：去掉 systemTags 和所有 tagSet 字段，version 降为 2
        const legacyBackup = {
            ...backup,
            version: 2,
            subjects: backup.subjects.map((s: { tagSet?: string }) => { const { tagSet, ...rest } = s; return rest; }),
            customTags: backup.customTags.map((t: { tagSet?: string }) => { const { tagSet, ...rest } = t; return rest; }),
        };
        delete legacyBackup.systemTags;
        await clearUserData();
        await importBackup(legacyBackup);

        // 旧版文件没有 systemTags，不创建系统标签
        const sysTags = await database.knowledgeTag.findMany({ where: { isSystem: true } });
        expect(sysTags.length).toBe(0);

        // 自定义标签按 default tagSet 导入
        const tags = await database.knowledgeTag.findMany({ where: { isSystem: false } });
        expect(tags.map((t) => t.tagSet)).toEqual(['default', 'default']);
    });

    it('没有掌握概率的题目导入后重新评估', async () => {
        await database.errorItem.update({ where: { id: 'item-1' }, data: { masteryProbability: null, masteryEvaluatedAt: null } });
        const backup = await exportBackup();
        await clearUserData();
        await importBackup(backup);
        const item = await database.errorItem.findFirstOrThrow({ where: { userId: 'user-1', questionText: '求解 x + 2 = 5' } });
        expect(item.masteryProbability).toBeNull();
        expect(mocks.scheduleMasteryEvaluation).toHaveBeenCalledWith([item.id]);
    });

    it('试卷、试卷题目及其作答记录完整保留，重复导入不新建试卷', async () => {
        await database.examPaper.create({
            data: {
                id: 'paper-1', userId: 'user-1', title: '周测', status: 'generating', scope: 'unmastered', difficulty: 'hard', requestedCount: 2,
                subjectIds: JSON.stringify(['math']), tagNames: JSON.stringify(['自定义标签']), resultsRecordedAt: new Date('2026-10-22T00:00:00Z'),
                createdAt: new Date('2026-10-21T00:00:00Z'),
                questions: { create: [
                    { id: 'question-1', order: 0, errorItemId: 'item-1', sourceShortId: 'AbC234', status: 'ready', questionText: '试卷新题', answerText: '答', analysis: '析', figureSvg: figure, figureScale: 75, figureAlign: 'right', answerSpacePx: 180, score: 2.5 },
                    { id: 'question-2', order: 1, errorItemId: 'item-1', sourceShortId: 'AbC234', status: 'pending' },
                ] },
            },
        });
        await database.practiceRecord.create({
            data: { userId: 'user-1', errorItemId: 'item-1', examQuestionId: 'question-1', result: 'wrong', isCorrect: false, source: 'exam', questionText: '试卷新题' },
        });
        const backup = await exportBackup();
        expect(backup.examPapers[0].questions[0].figureScale).toBe(75);
        expect(backup.examPapers[0].questions[0].figureAlign).toBe('right');
        expect(backup.examPapers[0].questions[0].answerSpacePx).toBe(180);
        expect(backup.examPapers[0].questions[0].score).toBe(2.5);
        await clearUserData();
        const { stats } = await importBackup(backup);
        expect(stats.examPapersCreated).toBe(1);

        const item = await database.errorItem.findFirstOrThrow({ where: { userId: 'user-1', questionText: '求解 x + 2 = 5' } });
        const subject = await database.subject.findFirstOrThrow({ where: { userId: 'user-1' } });
        const paper = await database.examPaper.findFirstOrThrow({ where: { userId: 'user-1' }, include: { questions: { orderBy: { order: 'asc' } } } });
        expect(paper).toMatchObject({
            title: '周测', status: 'partial', scope: 'unmastered', difficulty: 'hard', mode: 'generate', requestedCount: 2,
            subjectIds: JSON.stringify([subject.id]), tagNames: JSON.stringify(['自定义标签']),
            resultsRecordedAt: new Date('2026-10-22T00:00:00Z'), createdAt: new Date('2026-10-21T00:00:00Z'),
        });
        expect(paper.questions).toMatchObject([
            { order: 0, errorItemId: item.id, sourceShortId: 'AbC234', status: 'ready', questionText: '试卷新题', figureSvg: figure, figureScale: 75, figureAlign: 'right', answerSpacePx: 180, score: 2.5 },
            // 导出时仍在生成的题目按失败导入，缺省配图比例为 100、位置为居中，留白按全局档位，分值未设
            { order: 1, errorItemId: item.id, status: 'failed', figureScale: 100, figureAlign: 'center', answerSpacePx: null, score: null },
        ]);
        expect(await database.practiceRecord.findFirstOrThrow({ where: { source: 'exam' } })).toMatchObject({ examQuestionId: paper.questions[0].id, errorItemId: item.id });

        // 再导入一次：试卷不重复，作答记录关联到已有的试卷题目
        const again = await importBackup(backup);
        expect(again.stats.examPapersCreated).toBe(0);
        expect(await database.examPaper.count({ where: { userId: 'user-1' } })).toBe(1);
        const examRecords = await database.practiceRecord.findMany({ where: { source: 'exam' } });
        expect(examRecords.map((record) => record.examQuestionId)).toEqual([paper.questions[0].id, paper.questions[0].id]);
    });

    it('原题直出试卷的 mode 与 original 难度随备份往返，旧文件缺省 generate', async () => {
        await database.examPaper.create({
            data: {
                id: 'paper-orig', userId: 'user-1', title: '原题卷', status: 'ready', scope: 'all', difficulty: 'original', mode: 'original', requestedCount: 1,
                subjectIds: JSON.stringify(['math']), createdAt: new Date('2026-10-23T00:00:00Z'),
                questions: { create: [
                    { id: 'q-orig', order: 0, errorItemId: 'item-1', sourceShortId: 'AbC234', status: 'ready', questionText: '原题', answerText: '答', analysis: '析' },
                ] },
            },
        });
        const backup = await exportBackup();
        const origPaper = backup.examPapers.find((p: { id: string }) => p.id === 'paper-orig');
        expect(origPaper.mode).toBe('original');
        await clearUserData();
        await importBackup(backup);
        const paper = await database.examPaper.findFirstOrThrow({ where: { userId: 'user-1', title: '原题卷' } });
        expect(paper.mode).toBe('original');
        expect(paper.difficulty).toBe('original');

        // 模拟旧版文件（无 mode 字段）：缺省 generate
        const legacyBackup = await exportBackup();
        delete legacyBackup.examPapers[0].mode;
        legacyBackup.examPapers[0].difficulty = 'hard';
        legacyBackup.version = 7;
        await clearUserData();
        await importBackup(legacyBackup);
        const legacyPaper = await database.examPaper.findFirstOrThrow({ where: { userId: 'user-1' }, include: { questions: { orderBy: { order: 'asc' } } } });
        expect(legacyPaper.mode).toBe('generate');
        expect(legacyPaper.difficulty).toBe('hard');

        // 旧版文件没有 score 字段：导入后分值为空
        expect(legacyPaper.questions[0].score).toBeNull();
    });

    it('试卷题目的 questionType 快照与 groupByType 开关随备份往返，旧版文件缺省 null/false', async () => {
        await database.examPaper.create({
            data: {
                id: 'paper-sec', userId: 'user-1', title: '分大题卷', status: 'ready', scope: 'all', difficulty: 'medium', mode: 'generate',
                requestedCount: 2, groupByType: true, subjectIds: JSON.stringify(['math']),
                createdAt: new Date('2026-10-24T00:00:00Z'),
                questions: { create: [
                    { id: 'q-sec-1', order: 0, errorItemId: 'item-1', sourceShortId: 'AbC234', status: 'ready', questionText: '题1', questionType: 'single_choice', score: 2 },
                    { id: 'q-sec-2', order: 1, errorItemId: 'item-2', sourceShortId: 'XyZ789', status: 'ready', questionText: '题2', questionType: null },
                ] },
            },
        });
        const backup = await exportBackup();
        const paper = backup.examPapers.find((p: { id: string }) => p.id === 'paper-sec');
        expect(paper.groupByType).toBe(true);
        expect(paper.questions[0].questionType).toBe('single_choice');
        expect(paper.questions[1].questionType ?? null).toBeNull();

        await clearUserData();
        await importBackup(backup);
        const restored = await database.examPaper.findFirstOrThrow({ where: { userId: 'user-1', title: '分大题卷' }, include: { questions: { orderBy: { order: 'asc' } } } });
        expect(restored.groupByType).toBe(true);
        expect(restored.questions.map((question) => question.questionType)).toEqual(['single_choice', null]);

        // 模拟旧版备份（version 10，无 groupByType 与 questionType 字段）：缺省 false / null
        const legacyBackup = await exportBackup();
        legacyBackup.version = 10;
        for (const legacyPaper of legacyBackup.examPapers) {
            delete legacyPaper.groupByType;
            for (const question of legacyPaper.questions) {
                delete question.questionType;
            }
        }
        await clearUserData();
        await importBackup(legacyBackup);
        const legacy = await database.examPaper.findFirstOrThrow({ where: { userId: 'user-1', title: '分大题卷' }, include: { questions: { orderBy: { order: 'asc' } } } });
        expect(legacy.groupByType).toBe(false);
        expect(legacy.questions.map((question) => question.questionType)).toEqual([null, null]);
    });

    it('云端语音随备份导入、导出：只导出与动画讲解一致的语音，不合法的跳过，已有的不重复写入', async () => {
        const narrated = embedNarration(animation('画面'), [{ begin: 0, text: '先看条件' }]);
        await database.errorItem.update({ where: { id: 'item-1' }, data: { svgAnimation: narrated } });
        const audio = encodeMp3({ sampleRate: 24000, samples: new Float32Array(2400) }).toString('base64');
        const speech = { provider: 'minimax', model: 'speech-2.8-hd', voice: 'male-qn-jingying', language: 'zh', text: '先看条件', audio };
        const oldMarin = { ...speech, provider: 'openai', model: 'gpt-4o-mini-tts', voice: 'marin' };
        const teacherMarin = { ...oldMarin, style: 'marin-teacher' };
        const updatedMarin = { ...oldMarin, style: 'marin-teacher-v2' };
        const conversationalMarin = { ...oldMarin, style: 'marin-conversational' };

        const backup = await exportBackup();
        expect(backup.ttsSpeeches).toEqual([]);

        const { stats } = await importBackup({
            ...backup,
            ttsSpeeches: [
                speech,
                oldMarin,
                teacherMarin,
                updatedMarin,
                conversationalMarin,
                { ...speech, text: '与动画无关的话' },
                { ...speech, text: '不是 MP3', audio: Buffer.from('not mp3').toString('base64') },
                { ...speech, provider: 'unknown' },
                { ...speech, text: '' },
            ],
        });
        expect(stats.ttsSpeechesImported).toBe(6);

        const exported = await exportBackup();
        expect(exported.ttsSpeeches).toHaveLength(5);
        expect(exported.ttsSpeeches).toEqual(expect.arrayContaining([speech, oldMarin, teacherMarin, updatedMarin, conversationalMarin]));
        expect((await importBackup(exported)).stats.ttsSpeechesImported).toBe(0);
    });

    it('还原本人的偏好设置，不合法的单项跳过', async () => {
        await database.user.update({
            where: { id: 'user-1' },
            data: { confirmBeforeImport: true, questionDuplicateThreshold: 75.5, masteryThreshold: 70, enableGeogebra: true, enableSvgAnimation: false, themePreference: 'dark', gradeRecognitionMode: 'ai', fixedGradeSemester: '四年级上' },
        });
        const backup = await exportBackup();
        expect(backup.user).toMatchObject({ confirmBeforeImport: true, questionDuplicateThreshold: 75.5, masteryThreshold: 70, enableGeogebra: true, enableSvgAnimation: false, themePreference: 'dark', gradeRecognitionMode: 'ai', fixedGradeSemester: '四年级上' });

        await database.user.update({
            where: { id: 'user-1' },
            data: { confirmBeforeImport: false, questionDuplicateThreshold: 90, masteryThreshold: 50, enableGeogebra: false, enableSvgAnimation: true, themePreference: 'system', gradeRecognitionMode: 'fixed', fixedGradeSemester: null },
        });
        backup.user.questionDuplicateThreshold = 500;
        const { stats } = await importBackup(backup);
        expect(stats.preferencesRestored).toBe(true);
        expect(await database.user.findUniqueOrThrow({ where: { id: 'user-1' } })).toMatchObject({
            confirmBeforeImport: true, questionDuplicateThreshold: 90, masteryThreshold: 70, enableGeogebra: true, enableSvgAnimation: false, themePreference: 'dark',
            gradeRecognitionMode: 'ai', fixedGradeSemester: '四年级上',
        });
    });

    it('旧版文件没有偏好设置时不改动当前设置', async () => {
        await database.user.update({ where: { id: 'user-1' }, data: { enableGeogebra: true, gradeRecognitionMode: 'ai', fixedGradeSemester: '四年级下' } });
        const { stats } = await importBackup({ version: 1, user: { email: mocks.session.user.email }, errorItems: [] });
        expect(stats.preferencesRestored).toBe(false);
        expect((await database.user.findUniqueOrThrow({ where: { id: 'user-1' } })).enableGeogebra).toBe(true);
        expect(await database.user.findUniqueOrThrow({ where: { id: 'user-1' } })).toMatchObject({ gradeRecognitionMode: 'ai', fixedGradeSemester: '四年级下' });
    });

    it('无效年级规则不覆盖当前偏好，恢复题目保留原有年级', async () => {
        const backup = await exportBackup();
        backup.user.gradeRecognitionMode = 'invalid';
        backup.user.fixedGradeSemester = '十三年级上';
        await database.user.update({ where: { id: 'user-1' }, data: { gradeRecognitionMode: 'fixed', fixedGradeSemester: '四年级下' } });
        await clearUserData();
        await importBackup(backup);
        expect(await database.user.findUniqueOrThrow({ where: { id: 'user-1' } })).toMatchObject({ gradeRecognitionMode: 'fixed', fixedGradeSemester: '四年级下' });
        expect((await database.errorItem.findFirstOrThrow({ where: { userId: 'user-1', questionText: '求解 x + 2 = 5' } })).gradeSemester).toBe('初二上');
    });

    it('导入时重新净化 SVG，丢弃不合法的暂存练习和掌握概率', async () => {
        const backup = await exportBackup();
        await clearUserData();
        Object.assign(backup.errorItems[0], {
            svgAnimation: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1" height="1"/></svg>',
            svgAnimationEn: 'not svg',
            lastPractice: '{"questionText":""}',
            masteryProbability: 3,
        });
        await importBackup(backup);
        const item = await database.errorItem.findFirstOrThrow({ where: { userId: 'user-1', questionText: '求解 x + 2 = 5' } });
        expect(item.svgAnimation).not.toContain('script');
        expect(item.svgAnimationEn).toBeNull();
        expect(item.lastPractice).toBeNull();
        expect(item.masteryProbability).toBeNull();
        expect(mocks.scheduleMasteryEvaluation).toHaveBeenCalledWith([item.id]);
    });

    it('未处理的识别导入任务随备份往返：草稿保持待校对，执行中的标记为中断，不会自动调用 AI', async () => {
        const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
        const result = JSON.stringify({ questionText: '备份中的草稿题目', answerText: '答', analysis: '析', knowledgePoints: [], subject: '数学' });
        await database.importTask.createMany({ data: [
            { userId: 'user-1', mode: 'review', status: 'review', subjectId: 'math', targetSubjectId: 'math', imageData: image, result, timings: '{"server":{"analyze":1200}}', createdAt: new Date('2026-10-01T00:00:00Z') },
            { userId: 'user-1', mode: 'auto', status: 'analyzing', imageData: image, createdAt: new Date('2026-10-02T00:00:00Z') },
            { userId: 'user-1', mode: 'auto', status: 'failed', error: 'AI_TIMEOUT_ERROR', imageData: image, createdAt: new Date('2026-10-03T00:00:00Z') },
            { userId: 'user-1', mode: 'auto', status: 'saved', imageData: '', result, createdAt: new Date('2026-10-04T00:00:00Z') },
        ] });
        const backup = await exportBackup();
        expect(backup.importTasks).toHaveLength(3);
        expect(backup.importTasks.every((task: { status: string }) => task.status !== 'saved')).toBe(true);

        await clearUserData();
        const { stats } = await importBackup(backup);
        expect(stats.importTasksCreated).toBe(3);
        const tasks = await database.importTask.findMany({ where: { userId: 'user-1' }, orderBy: { createdAt: 'asc' } });
        const math = await database.subject.findFirstOrThrow({ where: { userId: 'user-1', name: '数学' } });
        expect(tasks.map((task) => [task.status, task.error])).toEqual([
            ['review', null],
            ['failed', 'SERVER_RESTARTED'],
            ['failed', 'AI_TIMEOUT_ERROR'],
        ]);
        // 来源标识写入幂等键，用于判断重复导入
        expect(await mapImageFields(tasks[0], imageDataUrl)).toMatchObject({ imageData: image, subjectId: math.id, targetSubjectId: math.id, clientRequestId: expect.any(String) });
        expect(JSON.parse(tasks[0].result!).questionText).toBe('备份中的草稿题目');

        // 再次导入同一文件不重复创建
        expect((await importBackup(backup)).stats.importTasksCreated).toBe(0);
    });

    it('未完成的多题批次随备份往返：草稿与调整保留，分题中的标记为中断，批次内任务仍关联本批，不会自动调用 AI', async () => {
        const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
        const draft = JSON.stringify({
            items: [
                { key: 'qa', label: '1', text: '（已手工修改）计算 1 + 1。', material: null, section: null, selected: true, regions: [], hasFigure: false, flags: [] },
                { key: 'qb', label: '2', text: '计算 2 + 2。', material: '公共材料', section: '一、计算题', selected: false, regions: [], hasFigure: false, flags: [] },
            ],
            ignored: ['姓名：____'], warnings: [],
        });
        const result = JSON.stringify({ questionText: '计算 3 + 3。', answerText: '6', analysis: '相加', knowledgePoints: [], subject: '数学' });
        await database.importBatch.createMany({ data: [
            { id: 'batch-draft-aaaaaaaa', userId: 'user-1', clientRequestId: 'batch-request-draft', source: 'text', splitter: 'local', status: 'draft', sourceText: '1．…\n2．…', draft, targetSubjectId: 'math', createdAt: new Date('2026-10-05T00:00:00Z') },
            { id: 'batch-split-bbbbbbbb', userId: 'user-1', source: 'image', splitter: 'ai', status: 'splitting', imageData: image, createdAt: new Date('2026-10-06T00:00:00Z') },
            { id: 'batch-start-cccccccc', userId: 'user-1', source: 'text', splitter: 'local', status: 'started', mode: 'review', draft, startedAt: new Date('2026-10-07T00:00:00Z'), createdAt: new Date('2026-10-07T00:00:00Z') },
            { id: 'batch-done-dddddddd', userId: 'user-1', source: 'text', splitter: 'local', status: 'started', mode: 'auto', draft, createdAt: new Date('2026-10-08T00:00:00Z') },
        ] });
        await database.importTask.createMany({ data: [
            { userId: 'user-1', mode: 'review', status: 'review', imageData: '', inputText: '计算 3 + 3。', result, batchId: 'batch-start-cccccccc', batchItemKey: 'qa', createdAt: new Date('2026-10-07T00:00:01Z') },
            { userId: 'user-1', mode: 'review', status: 'analyzing', imageData: '', inputText: '计算 4 + 4。', batchId: 'batch-start-cccccccc', batchItemKey: 'qb', createdAt: new Date('2026-10-07T00:00:02Z') },
            { userId: 'user-1', mode: 'auto', status: 'saved', imageData: '', result, batchId: 'batch-done-dddddddd', batchItemKey: 'qa', createdAt: new Date('2026-10-08T00:00:01Z') },
        ] });
        const backup = await exportBackup();
        expect(backup.importBatches.map((batch: { id: string }) => batch.id)).toEqual(['batch-draft-aaaaaaaa', 'batch-split-bbbbbbbb', 'batch-start-cccccccc']);

        await clearUserData();
        const { stats } = await importBackup(backup);
        expect(stats.importBatchesCreated).toBe(3);
        const batches = await database.importBatch.findMany({ where: { userId: 'user-1' }, orderBy: { createdAt: 'asc' }, include: { tasks: { orderBy: { createdAt: 'asc' } } } });
        const math = await database.subject.findFirstOrThrow({ where: { userId: 'user-1', name: '数学' } });
        expect(batches.map((batch) => [batch.status, batch.error])).toEqual([['draft', null], ['failed', 'SERVER_RESTARTED'], ['started', null]]);
        expect(batches[0]).toMatchObject({ targetSubjectId: math.id, sourceText: '1．…\n2．…', clientRequestId: 'batch-request-draft' });
        expect(JSON.parse(batches[0].draft!)).toEqual(JSON.parse(draft));
        expect(await imageDataUrl(batches[1].imageData)).toBe(image);
        expect(batches[2].tasks.map((task) => [task.status, task.error, task.inputText, task.batchItemKey])).toEqual([
            ['review', null, '计算 3 + 3。', 'qa'],
            ['failed', 'SERVER_RESTARTED', '计算 4 + 4。', 'qb'],
        ]);

        // 再次导入不重复创建批次或任务
        const again = await importBackup(backup);
        expect(again.stats).toMatchObject({ importBatchesCreated: 0, importTasksCreated: 0 });
        expect(await database.importBatch.count({ where: { userId: 'user-1' } })).toBe(3);
    });

    it('部分完成的批次随备份往返：已保存的题保留完成状态与错题链接，不重新识别、不重复记做错记录', async () => {
        const result = JSON.stringify({ questionText: '批次中的题', answerText: '答', analysis: '析', knowledgePoints: [], subject: '数学' });
        const draft = JSON.stringify({ items: ['qa', 'qb', 'qc', 'qd'].map((key) => ({ key, label: null, text: key, material: null, section: null, selected: true, regions: [], hasFigure: false, flags: [] })), ignored: [], warnings: [] });
        // 只看本用例的批次：清掉之前用例留下的识别记录
        await database.importBatch.deleteMany({ where: { userId: 'user-1' } });
        await database.importTask.deleteMany({ where: { userId: 'user-1' } });
        const saved = await database.errorItem.create({ data: { userId: 'user-1', subjectId: 'math', questionText: '批次中已入库的题', answerText: '答', originalImageUrl: '' } });
        await database.importBatch.create({ data: { id: 'batch-partial-aaaaaaa', userId: 'user-1', source: 'text', splitter: 'local', status: 'started', mode: 'auto', draft, startedAt: new Date('2026-10-09T00:00:00Z'), createdAt: new Date('2026-10-09T00:00:00Z') } });
        await database.importTask.createMany({ data: [
            { userId: 'user-1', mode: 'auto', status: 'saved', imageData: '', inputText: '已入库', result, errorItemId: saved.id, batchId: 'batch-partial-aaaaaaa', batchItemKey: 'qa', finishedAt: new Date('2026-10-09T00:01:00Z'), createdAt: new Date('2026-10-09T00:00:01Z') },
            { userId: 'user-1', mode: 'auto', status: 'saved', imageData: '', inputText: '入库后错题被删', result, duplicate: true, batchId: 'batch-partial-aaaaaaa', batchItemKey: 'qb', createdAt: new Date('2026-10-09T00:00:02Z') },
            { userId: 'user-1', mode: 'auto', status: 'review', imageData: '', inputText: '待校对', result, batchId: 'batch-partial-aaaaaaa', batchItemKey: 'qc', createdAt: new Date('2026-10-09T00:00:03Z') },
            { userId: 'user-1', mode: 'auto', status: 'failed', error: 'AI_TIMEOUT_ERROR', imageData: '', inputText: '失败', batchId: 'batch-partial-aaaaaaa', batchItemKey: 'qd', createdAt: new Date('2026-10-09T00:00:04Z') },
        ] });
        const backup = await exportBackup();
        expect(backup.importTasks.filter((task: { batchId: string | null }) => task.batchId === 'batch-partial-aaaaaaa')).toHaveLength(4);

        await clearUserData();
        const { stats } = await importBackup(backup);
        expect(stats).toMatchObject({ importBatchesCreated: 1, importTasksCreated: 4 });
        const batch = await database.importBatch.findFirstOrThrow({ where: { userId: 'user-1', clientRequestId: 'batch-partial-aaaaaaa' }, include: { tasks: { orderBy: { createdAt: 'asc' } } } });
        const restoredItem = await database.errorItem.findFirstOrThrow({ where: { userId: 'user-1', questionText: '批次中已入库的题' } });
        expect(batch.tasks.map((task) => [task.batchItemKey, task.status, task.errorItemId, task.duplicate, task.error])).toEqual([
            ['qa', 'saved', restoredItem.id, false, null],
            ['qb', 'saved', null, true, null],
            ['qc', 'review', null, false, null],
            ['qd', 'failed', null, false, 'AI_TIMEOUT_ERROR'],
        ]);
        expect(batch.tasks.slice(0, 2).every((task) => task.readAt !== null)).toBe(true);

        // 再次导入（不清空）：不重复创建批次、任务、错题或做错记录
        const itemsBefore = await database.errorItem.count({ where: { userId: 'user-1' } });
        const records = await database.practiceRecord.count({ where: { userId: 'user-1' } });
        const again = await importBackup(backup);
        expect(again.stats).toMatchObject({ importBatchesCreated: 0, importTasksCreated: 0 });
        expect(await database.importTask.count({ where: { batchId: batch.id } })).toBe(4);
        expect(await database.errorItem.count({ where: { userId: 'user-1' } })).toBe(itemsBefore);
        // 新增的做错记录全部来自错题本身的重复导入（既有判重规则，计入 practiceRecordsCreated），还原任务不额外追加
        expect(await database.practiceRecord.count({ where: { userId: 'user-1' } })).toBe(records + again.stats.practiceRecordsCreated);
    });

    it('旧版备份没有识别任务字段时正常导入', async () => {
        const backup = await exportBackup();
        delete backup.importTasks;
        delete backup.importBatches;
        backup.version = 4;
        await clearUserData();
        const { stats } = await importBackup(backup);
        expect(stats.importTasksCreated).toBe(0);
        expect(await database.errorItem.count({ where: { userId: 'user-1' } })).toBeGreaterThan(0);
    });

    it('导入不含 extensions 的旧版备份成功，stats.extensionsImported 为空', async () => {
        const backup = await exportBackup();
        delete backup.extensions;
        backup.version = 6;
        await clearUserData();
        const { stats } = await importBackup(backup);
        expect(stats.extensionsImported).toEqual({});
        expect(await database.errorItem.count({ where: { userId: 'user-1' } })).toBeGreaterThan(0);
    });

    it('导入含未知扩展的备份成功并跳过，stats.extensionsImported 不含未知 key', async () => {
        const backup = await exportBackup();
        backup.extensions = { 'unknown-ext': { version: 1, data: { foo: 'bar' } } };
        await clearUserData();
        const { stats } = await importBackup(backup);
        expect(stats.extensionsImported).toEqual({});
        expect(await database.errorItem.count({ where: { userId: 'user-1' } })).toBeGreaterThan(0);
    });

    it('同一时间同一图片的不同任务全部还原；按来源标识判断重复导入，再次导出保留来源标识', async () => {
        const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
        const createdAt = new Date('2026-10-05T00:00:00Z');
        const draft = (questionText: string) => JSON.stringify({ questionText, answerText: '答', analysis: '析', knowledgePoints: [], subject: '数学' });
        await database.importTask.createMany({ data: [
            { id: 'source-task-aaaaaaaa', clientRequestId: 'client-request-aaaa', userId: 'user-1', mode: 'review', status: 'review', imageData: image, result: draft('第一份草稿'), createdAt },
            // 旧数据没有幂等键时用任务编号作为来源标识
            { id: 'source-task-bbbbbbbb', userId: 'user-1', mode: 'review', status: 'review', imageData: image, result: draft('第二份草稿'), createdAt },
        ] });
        const backup = await exportBackup();
        expect(backup.importTasks.map((task: { clientRequestId: string | null }) => task.clientRequestId).sort()).toEqual(['client-request-aaaa', null]);
        // 原任务仍在时导入同一备份不重复创建
        expect((await importBackup(backup)).stats.importTasksCreated).toBe(0);

        await clearUserData();
        expect((await importBackup(backup)).stats.importTasksCreated).toBe(2);
        const drafts = await database.importTask.findMany({ where: { userId: 'user-1' }, orderBy: { clientRequestId: 'asc' } });
        expect(drafts.map((task) => [task.clientRequestId, JSON.parse(task.result!).questionText])).toEqual([
            ['client-request-aaaa', '第一份草稿'],
            ['source-task-bbbbbbbb', '第二份草稿'],
        ]);

        // 重复导入同一备份、再次导出后导入都不重复创建，来源标识保持不变
        expect((await importBackup(backup)).stats.importTasksCreated).toBe(0);
        const again = await exportBackup();
        expect(again.importTasks.map((task: { clientRequestId: string }) => task.clientRequestId).sort()).toEqual(['client-request-aaaa', 'source-task-bbbbbbbb']);
        expect((await importBackup(again)).stats.importTasksCreated).toBe(0);
        expect(await database.importTask.count({ where: { userId: 'user-1' } })).toBe(2);
    });

    it('跨账户恢复同一备份：原任务仍属于其他账户时，目标账户只创建一次且不影响原账户', async () => {
        const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
        const draft = (questionText: string) => JSON.stringify({ questionText, answerText: '答', analysis: '析', knowledgePoints: [], subject: '数学' });
        const createdAt = new Date('2026-10-06T00:00:00Z');
        await database.importTask.createMany({ data: [
            { id: 'cross-task-aaaaaaaa', clientRequestId: 'cross-request-aaaa', userId: 'user-1', mode: 'review', status: 'review', imageData: image, result: draft('草稿 A'), createdAt },
            { id: 'cross-task-bbbbbbbb', clientRequestId: 'cross-request-bbbb', userId: 'user-1', mode: 'review', status: 'review', imageData: image, result: draft('草稿 B'), createdAt },
        ] });
        const backup = await exportBackup();
        await database.user.upsert({ where: { email: 'backup-other@example.com' }, update: {}, create: { id: 'backup-other', email: 'backup-other@example.com', password: 'test-only' } });
        const restore = (tasks: unknown) => database.$transaction((tx) => importImportTasks(tx, tasks, {
            resolveUserId: () => 'backup-other', subjectIdMap: new Map(), paperGroupIdMap: new Map(),
        }));
        expect(await restore(backup.importTasks)).toBe(2);
        expect(await restore(backup.importTasks)).toBe(0);
        const restored = await database.importTask.findMany({ where: { userId: 'backup-other' } });
        expect(restored).toHaveLength(2);
        expect(restored.map((task) => task.id)).not.toContain('cross-task-aaaaaaaa');
        // 目标账户再次导出后导入仍按来源判断
        const reexported = restored.map((task) => ({ ...task, createdAt: task.createdAt.toISOString(), finishedAt: task.finishedAt?.toISOString() ?? null }));
        expect(await restore(reexported)).toBe(0);
        expect(await database.importTask.count({ where: { userId: 'backup-other' } })).toBe(2);
        // 原账户的任务不受影响
        expect(await database.importTask.count({ where: { userId: 'user-1' } })).toBe(2);
        expect(JSON.parse((await database.importTask.findUniqueOrThrow({ where: { id: 'cross-task-aaaaaaaa' } })).result!).questionText).toBe('草稿 A');
        await database.user.delete({ where: { id: 'backup-other' } });
    });

    describe('备份扩展（BACKUP_EXTENSIONS）', () => {
        const testExt: BackupExtension = {
            key: 'test-bank',
            version: 1,
            export: vi.fn().mockResolvedValue({ bankItems: ['a', 'b'] }),
            import: vi.fn().mockResolvedValue(3),
        };
        const failingExt: BackupExtension = {
            key: 'test-fail',
            version: 1,
            export: vi.fn().mockResolvedValue(null),
            import: vi.fn().mockRejectedValue(new Error('extension boom')),
        };

        afterEach(() => {
            for (const ext of [testExt, failingExt]) {
                const idx = BACKUP_EXTENSIONS.indexOf(ext);
                if (idx >= 0) BACKUP_EXTENSIONS.splice(idx, 1);
            }
        });

        it('导出时 extensions 带上已注册扩展的 version 和 data', async () => {
            BACKUP_EXTENSIONS.push(testExt);
            const backup = await exportBackup();
            expect(backup.extensions['test-bank']).toEqual({ version: 1, data: { bankItems: ['a', 'b'] } });
            expect(testExt.export).toHaveBeenCalledWith({ userIds: ['user-1'] });
        });

        it('导入时扩展收到正确的 ID 映射和 userIdMap', async () => {
            BACKUP_EXTENSIONS.push(testExt);
            const backup = await exportBackup();
            await clearUserData();
            await importBackup(backup);

            expect(testExt.import).toHaveBeenCalledTimes(1);
            const [ctx, payload] = vi.mocked(testExt.import).mock.calls[0];
            expect(payload).toEqual({ version: 1, data: { bankItems: ['a', 'b'] } });
            // errorItemIdMap 把旧 ID 映射到数据库中真实存在的新 ID
            const newItem = await database.errorItem.findFirstOrThrow({ where: { userId: 'user-1', questionText: '求解 x + 2 = 5' } });
            expect(ctx.errorItemIdMap.get('item-1')).toBe(newItem.id);
            // userIdMap(旧 userId) 返回当前用户
            expect(ctx.userIdMap('user-1')).toBe('user-1');
        });

        it('扩展 import 抛错时整个导入事务回滚', async () => {
            BACKUP_EXTENSIONS.push(failingExt);
            const backup = await exportBackup();
            await clearUserData();
            const itemsAfterClear = await database.errorItem.count({ where: { userId: 'user-1' } });
            expect(itemsAfterClear).toBe(0);

            // 导入应失败（扩展抛错导致事务回滚）
            const response = await IMPORT(new Request('http://localhost/api/import', {
                method: 'POST',
                body: JSON.stringify(backup),
                headers: { 'Content-Type': 'application/json' },
            }));
            expect(response.status).toBe(500);
            // 核心数据回滚到导入前（清空后）的状态
            expect(await database.errorItem.count({ where: { userId: 'user-1' } })).toBe(itemsAfterClear);
        });
    });
});


describe('试卷作答备份第 18 版', () => {
    it.each([{ index: 0, reason: 'unreadable' }, { index: -1, reason: 'locate_failed' }])('完整还原作答、逐题图片、整页照片与练习关联，并重映射 ID（$reason）', async issue => {
        const paper = await database.examPaper.create({ data: {
            userId: 'user-1', title: '作答备份测试', status: 'ready', scope: 'all', mode: 'original', difficulty: 'medium', requestedCount: 1, subjectIds: '["math"]',
            questions: { create: [{ order: 0, errorItemId: 'item-1', sourceShortId: 'AbC234', questionText: '1+1=?', answerText: '2', analysis: '解析', status: 'ready' }] },
        }, include: { questions: true } });
        const image = await storeImage(ANSWER_IMAGE);
        const attempt = await database.examAttempt.create({ data: {
            userId: 'user-1', paperId: paper.id, kind: 'photo', status: 'done', durationSec: 123,
            startedAt: new Date('2026-11-01T10:00:00Z'), submittedAt: new Date('2026-11-01T10:02:03Z'), confirmedAt: new Date('2026-11-01T10:03:00Z'),
            pageImages: JSON.stringify([image]),
            pageIssues: JSON.stringify([issue]),
            pageLocations: JSON.stringify([{ image, result: { pageReadable: false, paperCode: '', answers: [] } }]),
            answers: { create: [{ examQuestionId: paper.questions[0].id, answerText: '2', answerImageUrl: image, gradingImages: JSON.stringify([image]), gradingRetries: 1, flagged: true, pageIndex: 0, region: '{"x":0,"y":0,"width":1,"height":1}', recognizedAnswer: '二', handMark: 'correct', aiResult: 'unknown', aiReason: '看不清', finalResult: 'correct' }] },
        } });
        await database.practiceRecord.create({ data: {
            userId: 'user-1', errorItemId: 'item-1', source: 'exam', examQuestionId: paper.questions[0].id, examAttemptId: attempt.id,
            result: 'correct', isCorrect: true, durationSec: 123, answerImageUrl: image, wrongAnswerText: '2', recognizedAnswer: '二', gradeReason: '看不清', createdAt: new Date('2026-11-01T10:02:03Z'),
        } });
        const backup = await exportBackup();
        expect(backup.version).toBe(20);
        expect(backup.examAttempts[0].answers[0].answerImageUrl).toBe(ANSWER_IMAGE);
        expect(JSON.parse(backup.examAttempts[0].pageImages)).toEqual([ANSWER_IMAGE]);
        expect(JSON.parse(backup.examAttempts[0].pageIssues)).toEqual([issue]);
        expect(JSON.parse(backup.examAttempts[0].pageLocations)[0].image).toBe(ANSWER_IMAGE);
        expect(JSON.parse(backup.examAttempts[0].answers[0].gradingImages)).toEqual([ANSWER_IMAGE]);
        expect(backup.examAttempts[0].answers[0].gradingRetries).toBe(1);
        await clearUserData();
        await importBackup(backup);
        const restored = await database.examAttempt.findFirstOrThrow({ include: { answers: true, practiceRecords: true, paper: true } });
        expect(restored.id).not.toBe(attempt.id);
        expect(restored.paperId).not.toBe(paper.id);
        expect(restored).toMatchObject({ kind: 'photo', status: 'done', durationSec: 123, submittedAt: new Date('2026-11-01T10:02:03Z') });
        expect(restored.answers[0]).toMatchObject({ answerText: '2', flagged: true, pageIndex: 0, region: '{"x":0,"y":0,"width":1,"height":1}', recognizedAnswer: '二', handMark: 'correct', aiResult: 'unknown', aiReason: '看不清', finalResult: 'correct' });
        expect(restored.answers[0].examQuestionId).not.toBe(paper.questions[0].id);
        expect(await imageDataUrl(restored.answers[0].answerImageUrl!)).toBe(ANSWER_IMAGE);
        expect(await imageDataUrl(JSON.parse(restored.answers[0].gradingImages!)[0])).toBe(ANSWER_IMAGE);
        expect(restored.answers[0].gradingRetries).toBe(1);
        expect(await imageDataUrl(JSON.parse(restored.pageImages!)[0])).toBe(ANSWER_IMAGE);
        expect(JSON.parse(restored.pageIssues!)).toEqual([issue]);
        expect(JSON.parse(restored.pageLocations!)[0].image).toBe(JSON.parse(restored.pageImages!)[0]);
        expect(restored.practiceRecords).toHaveLength(1);
        expect(restored.practiceRecords[0]).toMatchObject({ examAttemptId: restored.id, examQuestionId: restored.answers[0].examQuestionId, durationSec: 123, wrongAnswerText: '2', gradeReason: '看不清' });
        expect(restored.practiceRecords[0].answerImageUrl).toBe(restored.answers[0].answerImageUrl);
        expect(JSON.parse(restored.pageImages!)[0]).toBe(restored.answers[0].answerImageUrl);
        expect(await imageDataUrl(restored.practiceRecords[0].answerImageUrl!)).toBe(ANSWER_IMAGE);
        await importBackup(backup);
        expect(await database.examAttempt.count()).toBe(1);
    });

    it('目标已有未完成作答时仅跳过冲突作答，保留现有答案并继续导入其他数据', async () => {
        const paper = await database.examPaper.create({ data: {
            userId: 'user-1', title: '未完成作答', status: 'ready', scope: 'all', difficulty: 'medium', requestedCount: 1, subjectIds: '[]',
            questions: { create: [{ order: 0, errorItemId: 'item-1', sourceShortId: 'AbC234', questionText: '题目', status: 'ready' }] },
        }, include: { questions: true } });
        const existing = await database.examAttempt.create({ data: {
            userId: 'user-1', paperId: paper.id, kind: 'online',
            answers: { create: [{ examQuestionId: paper.questions[0].id, answerText: '保留现有答案' }] },
        } });
        const backup = await exportBackup();
        const count = await database.practiceRecord.count();
        backup.examAttempts[0].startedAt = '2026-10-01T00:00:00.000Z';
        backup.examAttempts[0].answers[0].answerText = '备份冲突答案';
        const completed = structuredClone(backup.examAttempts[0]);
        completed.id = 'completed-attempt';
        completed.status = 'done';
        completed.confirmedAt = '2026-10-01T01:00:00.000Z';
        completed.answers[0].id = 'completed-answer';
        completed.answers[0].attemptId = completed.id;
        backup.examAttempts.push(completed);
        backup.subjects.push({ ...backup.subjects[0], id: 'new-subject', name: '继续导入的错题本' });
        const response = await importBackup(backup);
        // 重复导入错题会按既有规则各生成一条导入历史，另加备份中的练习记录。
        expect(response.stats.duplicateErrorItems).toBe(backup.errorItems.length);
        expect(response.stats.practiceRecordsCreated).toBe(count + backup.errorItems.length);
        expect(await database.examAttempt.count()).toBe(2);
        expect(await database.examAttempt.count({ where: { status: { not: 'done' } } })).toBe(1);
        expect(await database.examAttempt.findUniqueOrThrow({ where: { id: existing.id }, include: { answers: true } })).toMatchObject({
            status: 'answering', answers: [expect.objectContaining({ answerText: '保留现有答案' })],
        });
        expect(await database.examAttempt.findFirst({ where: { status: 'done' }, include: { answers: true } })).toMatchObject({
            answers: [expect.objectContaining({ answerText: '备份冲突答案' })],
        });
        expect(await database.subject.findFirst({ where: { name: '继续导入的错题本' } })).not.toBeNull();
        expect(await database.practiceRecord.count()).toBe(count * 2 + backup.errorItems.length);
        expect(mocks.warn).toHaveBeenCalledWith(expect.objectContaining({ paperId: paper.id, attemptId: existing.id }), '跳过与现有未完成作答冲突的备份作答');
    });

    it('仍拒绝跨用户作答引用', async () => {
        const paper = await database.examPaper.create({ data: {
            userId: 'user-1', title: '未完成作答', status: 'ready', scope: 'all', difficulty: 'medium', requestedCount: 0, subjectIds: '[]',
        } });
        await database.examAttempt.create({ data: { userId: 'user-1', paperId: paper.id, kind: 'online' } });
        const backup = await exportBackup();
        backup.examAttempts[0].userId = 'other-user';
        expect((await IMPORT(new Request('http://localhost/api/import', { method: 'POST', body: JSON.stringify(backup) }))).status).toBe(400);
    });

    it('第 17 版没有作答数据时沿用原有导入', async () => {
        const backup = await exportBackup();
        backup.version = 17;
        delete backup.examAttempts;
        for (const record of backup.practiceRecords) delete record.examAttemptId;
        await clearUserData();
        await importBackup(backup);
        expect(await database.examAttempt.count()).toBe(0);
        expect(await database.practiceRecord.count()).toBeGreaterThan(0);
    });
});


describe('第 20 版奖励账本备份', () => {
    it('旧版盲盒与集齐账目原样导入，读取自动映射到新目录', async () => {
        const now = new Date('2026-11-12T04:00:00Z');
        const meta = JSON.stringify({ rulesVersion: 1, stickerId: 'stationery-pencil', setCompleted: 'stationery' });
        await database.rewardEntry.createMany({ data: [
            { id: 'legacy-box', userId: 'user-1', type: 'blindbox', day: '2026-11-12', refKey: 'box:2026-11-09', points: 0, meta },
            { id: 'legacy-set', userId: 'user-1', type: 'fun_set', day: '2026-11-12', refKey: 'set:stationery', points: 50 },
        ] });
        const backup = await exportBackup();
        expect(backup.version).toBe(20);
        await clearUserData();
        await importBackup(backup);
        expect((await getRewardSummary('user-1', now)).weekly.box).toMatchObject({ stickerId: 'history-terracotta', setCompleted: 'history' });
        expect((await getRewardFunStickers('user-1', now)).stickers.filter(sticker => sticker.owned)).toEqual([
            expect.objectContaining({ id: 'history-terracotta', setId: 'history', day: '2026-11-12' }),
        ]);
        expect((await getRewardWeek('user-1', '2026-11-09', now)).funStickers).toEqual(['history-terracotta']);
        expect(await database.rewardEntry.findUniqueOrThrow({ where: { id: 'legacy-box' } })).toMatchObject({ meta });
        expect(await database.rewardEntry.findUniqueOrThrow({ where: { id: 'legacy-set' } })).toMatchObject({ refKey: 'set:stationery', points: 50 });
        expect((await exportBackup()).rewardEntries.find((entry: { id: string }) => entry.id === 'legacy-box').meta).toBe(meta);
    });

    it('请假卡、周奖与盲盒原样恢复，再结算不补卡、不重抽', async () => {
        const now = new Date('2026-11-12T04:00:00Z');
        const real = [...Array.from({ length: 7 }, (_, i) => shiftDay('2026-11-02', i)), '2026-11-10', '2026-11-11', '2026-11-12'];
        await database.user.update({ where: { id: 'user-1' }, data: { weeklyGoalDays: 3 } });
        await database.practiceRecord.createMany({ data: real.map((day, i) => ({ id: `leave-record-${i}`, userId: 'user-1', errorItemId: 'item-2',
            source: 'review', result: 'wrong', createdAt: new Date(`${day}T04:00:00Z`) })) });
        await database.rewardEntry.create({ data: { userId: 'user-1', type: 'leave_start', day: '2026-11-02', refKey: 'leave-start', points: 0 } });
        const first = await settleRewards('user-1', now);
        const types = new Set(['leave_start', 'leave_earn', 'leave_use', 'weekly', 'blindbox']);
        const rewards = first.entries.filter(entry => types.has(entry.type));
        expect(new Set(rewards.map(entry => entry.type))).toEqual(types);
        const box = rewards.find(entry => entry.type === 'blindbox')!;
        expect(JSON.parse(box.meta!).stickerId).toBeTypeOf('string');
        const backup = await exportBackup();
        expect(backup.version).toBe(20);
        await clearUserData();
        await importBackup(backup);
        for (const reward of rewards) expect(await database.rewardEntry.findUniqueOrThrow({ where: { id: reward.id } })).toEqual(reward);
        const settled = await settleRewards('user-1', now);
        expect(settled.created).toEqual([]);
        expect(settled.progress.leaveDays).toContain('2026-11-09');
        expect(settled.entries.find(entry => entry.id === box.id)?.meta).toBe(box.meta);
        expect((await settleRewards('user-1', now)).created).toEqual([]);
        expect(await database.rewardEntry.count()).toBe(backup.rewardEntries.length);
    });

    it('勇者题与成就账目完整还原，引用重映射后再结算不重复', async () => {
        const now = new Date('2026-11-11T04:00:00Z');
        await database.errorItem.update({ where: { id: 'item-2' }, data: { difficultyStars: 4, masteryProbability: null } });
        await database.practiceRecord.create({ data: { id: 'brave-answer', userId: 'user-1', errorItemId: 'item-2',
            source: 'review', result: 'wrong', createdAt: new Date('2026-11-10T04:00:00Z') } });
        const first = await settleRewards('user-1', now);
        const pick = first.entries.find(entry => entry.type === 'brave_pick')!;
        const badge = first.entries.find(entry => entry.type === 'badge' && entry.refKey === 'badge:brave-1')!;
        expect(pick).toBeDefined();
        expect(badge).toBeDefined();
        const backup = await exportBackup();
        await clearUserData();
        await importBackup(backup);
        const restoredPick = await database.rewardEntry.findUniqueOrThrow({ where: { id: pick.id } });
        const restoredBadge = await database.rewardEntry.findUniqueOrThrow({ where: { id: badge.id } });
        expect(restoredPick).toMatchObject({ type: 'brave_pick', points: 0, day: pick.day, refKey: pick.refKey });
        expect(restoredBadge).toMatchObject({ type: 'badge', points: 0, day: badge.day, refKey: badge.refKey, meta: badge.meta });
        const itemId: string = JSON.parse(restoredPick.meta!).errorItemId;
        expect(await database.errorItem.findFirst({ where: { id: itemId, userId: 'user-1' } })).not.toBeNull();
        const settled = await settleRewards('user-1', now);
        expect(settled.created).toEqual([]);
        expect(settled.brave?.errorItemId).toBe(itemId);
        expect(await database.rewardEntry.count()).toBe(backup.rewardEntries.length);
        await importBackup(backup);
        expect((await settleRewards('user-1', now)).created).toEqual([]);
    });

    it('完整恢复奖励与偏好，重映射掌握和贴纸引用，再结算不重发', async () => {
        const now = new Date('2026-11-11T04:00:00Z');
        await database.user.update({ where: { id: 'user-1' }, data: { weeklyGoalDays: 5, rewardsEnabled: false } });
        await database.practiceRecord.create({ data: { id: 'unlinked-reward-practice', userId: 'user-1', source: 'practice', result: 'correct', difficulty: 'hard', isCorrect: true, createdAt: new Date('2026-10-20T01:00:00Z') } });
        await settleRewards('user-1', now);
        await database.rewardEntry.create({ data: { id: 'orphan-reward', userId: 'user-1', type: 'review', day: '2026-10-01', points: 1, refKey: 'record:deleted-record', meta: '{"rulesVersion":1}' } });
        const backup = await exportBackup();
        expect(backup.version).toBe(20);
        expect(backup.user).toMatchObject({ weeklyGoalDays: 5, rewardsEnabled: false });
        const total = backup.rewardEntries.reduce((sum: number, entry: { points: number }) => sum + entry.points, 0);
        await clearUserData();
        await database.user.update({ where: { id: 'user-1' }, data: { weeklyGoalDays: 3, rewardsEnabled: true } });
        await importBackup(backup);
        expect(await database.user.findUniqueOrThrow({ where: { id: 'user-1' } })).toMatchObject({ weeklyGoalDays: 5, rewardsEnabled: false });
        expect(await database.rewardEntry.count()).toBe(backup.rewardEntries.length);
        expect(await database.practiceRecord.findUniqueOrThrow({ where: { id: 'unlinked-reward-practice' } })).toMatchObject({ errorItemId: null, source: 'practice', result: 'correct', difficulty: 'hard' });
        for (const entry of backup.rewardEntries) {
            const restored = await database.rewardEntry.findUniqueOrThrow({ where: { id: entry.id } });
            expect(restored).toMatchObject({ day: entry.day, type: entry.type, points: entry.points, createdAt: new Date(entry.createdAt) });
            expect(JSON.parse(restored.meta!).rulesVersion).toBe(JSON.parse(entry.meta).rulesVersion);
            expect(JSON.parse(restored.meta!).backfilled).toBe(JSON.parse(entry.meta).backfilled);
        }
        expect(await database.rewardEntry.findUnique({ where: { id: 'orphan-reward' } })).toMatchObject({ refKey: 'record:deleted-record', points: 1 });
        const settled = await settleRewards('user-1', now);
        expect(settled.created).toEqual([]);
        expect(settled.balance).toBe(total);
        // 同一备份再次导入既不复制已记账记录，也不新增奖励。
        await importBackup(backup);
        expect((await settleRewards('user-1', now)).created).toEqual([]);
        expect(await database.rewardEntry.count()).toBe(backup.rewardEntries.length);
    });

    it('旧版缺失奖励与偏好时跳过账目并恢复默认偏好', async () => {
        const backup = await exportBackup();
        backup.version = 19;
        delete backup.rewardEntries;
        delete backup.user.weeklyGoalDays;
        delete backup.user.rewardsEnabled;
        await database.user.update({ where: { id: 'user-1' }, data: { weeklyGoalDays: 5, rewardsEnabled: false } });
        await clearUserData();
        await importBackup(backup);
        expect(await database.rewardEntry.count()).toBe(0);
        expect(await database.user.findUniqueOrThrow({ where: { id: 'user-1' } })).toMatchObject({ weeklyGoalDays: 4, rewardsEnabled: true });
    });
});
