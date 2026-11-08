// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const source = resolve('prisma');
const groupMigration = '20261031195209_add_paper_group';
const scaleMigration = '20261031204515_add_question_figure_scale';
const relationMigration = '20261101000000_add_paper_group_relation';
const minutesMigration = '20261108132441_review_minutes';
const migrations = readdirSync(join(source, 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const relatedTables = ['User', 'Subject', 'KnowledgeTag', '_ErrorItemToKnowledgeTag', 'ReviewSchedule', 'PracticeRecord', 'ExamPaper', 'ExamQuestion'];

let directory: string;
let databasePath: string;
let schemaPath: string;
let database: DatabaseSync | undefined;

function deploy(names = migrations) {
    for (const name of names) {
        cpSync(join(source, 'migrations', name), join(directory, 'migrations', name), { recursive: true });
    }
    return execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', schemaPath], {
        env: { ...process.env, DATABASE_URL: 'file:' + databasePath },
        encoding: 'utf8', stdio: 'pipe', timeout: 120000,
    });
}

function openDatabase() {
    database = new DatabaseSync(databasePath);
    database.exec('PRAGMA foreign_keys=ON');
    return database;
}

function closeDatabase() {
    database?.close();
    database = undefined;
}

function rows(table: string) {
    return database!.prepare('SELECT * FROM "' + table + '" ORDER BY rowid').all();
}

function seedLegacyData() {
    database!.exec(`
        INSERT INTO "User" (id, email, password, updatedAt) VALUES
            ('user-1', 'migration-one@example.com', 'test-only', '2026-10-01'),
            ('user-2', 'migration-two@example.com', 'test-only', '2026-10-02');
        INSERT INTO "Subject" (id, name, userId, updatedAt) VALUES ('math', '数学', 'user-1', '2026-10-01');
        INSERT INTO "KnowledgeTag" (id, name, subject, userId, updatedAt) VALUES ('tag', '方程', 'math', 'user-1', '2026-10-01');
        INSERT INTO "ErrorItem" (id, shortId, userId, subjectId, originalImageUrl, questionText, paperLevel, updatedAt) VALUES
            ('item-a', 'ShortA', 'user-1', 'math', 'image-a', '题目 A', 'a', '2026-10-01'),
            ('item-b', 'ShortB', 'user-1', 'math', 'image-b', '题目 B', 'b', '2026-10-02'),
            ('item-other', NULL, 'user-1', 'math', 'image-other', '其他题目', 'other', '2026-10-03'),
            ('item-invalid', NULL, 'user-1', 'math', 'image-invalid', '未知卷别', 'unknown', '2026-10-04'),
            ('item-null', NULL, 'user-1', 'math', 'image-null', '未分类', NULL, '2026-10-05'),
            ('item-user-2', NULL, 'user-2', NULL, 'image-two', '另一用户的题目', 'a', '2026-10-06');
        UPDATE "ErrorItem" SET answerText='答案', analysis='解析', wrongAnswerText='错误答案', mistakeAnalysis='错因',
            userNotes='保留笔记', difficultyStars=4, hasFigure=true, figureSvg='<svg/>', svgAnimation='<svg>动画</svg>',
            svgAnimationEn='<svg>animation</svg>', lastPractice='{"questionText":"变式题"}', masteryProbability=0.65,
            masteryReason='复习记录', masterySource='ai', masteryEvaluatedAt='2026-10-20';
        INSERT INTO "_ErrorItemToKnowledgeTag" (A, B) VALUES ('item-a', 'tag');
        INSERT INTO "ReviewSchedule" (id, errorItemId, scheduledFor) VALUES ('review', 'item-a', '2026-11-01');
        INSERT INTO "ExamPaper" (id, userId, title, scope, difficulty, requestedCount, subjectIds, updatedAt)
            VALUES ('exam', 'user-1', '迁移前的试卷', 'all', 'medium', 1, '["math"]', '2026-10-01');
        INSERT INTO "ExamQuestion" (id, paperId, "order", errorItemId, sourceShortId)
            VALUES ('exam-question', 'exam', 0, 'item-a', 'ShortA');
        INSERT INTO "PracticeRecord" (id, userId, errorItemId, examQuestionId, result, source, wrongAnswerText)
            VALUES ('practice', 'user-1', 'item-a', 'exam-question', 'wrong', 'duplicate_import', '原始作答');
    `);
}

function expectConstraints() {
    expect(database!.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(database!.prepare('PRAGMA foreign_key_list("ErrorItem")').all())
        .toContainEqual(expect.objectContaining({ table: 'PaperGroup', from: 'paperLevel', on_delete: 'SET NULL' }));
    expect(database!.prepare('PRAGMA index_list("ErrorItem")').all().map((index) => index.name))
        .toEqual(expect.arrayContaining(['ErrorItem_shortId_key', 'ErrorItem_userId_createdAt_idx', 'ErrorItem_subjectId_idx', 'ErrorItem_userId_nextReviewAt_idx']));
    expect(database!.prepare('PRAGMA index_list("PaperGroup")').all().map((index) => index.name))
        .toEqual(expect.arrayContaining(['PaperGroup_userId_key_key', 'PaperGroup_userId_name_key', 'PaperGroup_userId_order_idx']));
}

beforeEach(() => {
    // 迁移文件、Prisma 迁移记录和数据都写入系统临时目录。
    directory = mkdtempSync(join(tmpdir(), 'wrong-notebook-migrations-'));
    databasePath = join(directory, 'test.db');
    schemaPath = join(directory, 'schema.prisma');
    mkdirSync(join(directory, 'migrations'));
    cpSync(join(source, 'schema.prisma'), schemaPath);
    cpSync(join(source, 'migrations/migration_lock.toml'), join(directory, 'migrations/migration_lock.toml'));
});

afterEach(() => {
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
});

const reviewDefaults = { reviewStage: 0, reviewWrongStreak: 0, nextReviewAt: null, reviewCompletedAt: null, reviewSyncedAt: null, reviewOverride: null, reviewOverrideAt: null };

describe('真实 Prisma 数据库迁移', () => {
    it('全新数据库完整迁移后与 Prisma 模型一致，重复部署不再修改数据库', () => {
        deploy();
        openDatabase();
        expectConstraints();
        expect(database!.prepare('PRAGMA table_info("ErrorItem")').all())
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'figureScale', dflt_value: '100' }),
                expect.objectContaining({ name: 'figureAlign', dflt_value: "'center'" }),
                expect.objectContaining({ name: 'answerSpacePx', notnull: 0, dflt_value: null }),
                expect.objectContaining({ name: 'questionType', notnull: 0, dflt_value: null }),
            ]));
        expect(database!.prepare('PRAGMA table_info("ExamQuestion")').all())
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'figureScale', dflt_value: '100' }),
                expect.objectContaining({ name: 'figureAlign', dflt_value: "'center'" }),
                expect.objectContaining({ name: 'answerSpacePx', notnull: 0, dflt_value: null }),
            ]));
        expect(database!.prepare('PRAGMA table_info("PracticeRecord")').all())
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'answerImageUrl', type: 'TEXT', notnull: 0, dflt_value: null }),
                expect.objectContaining({ name: 'recognizedAnswer', type: 'TEXT', notnull: 0, dflt_value: null }),
                expect.objectContaining({ name: 'durationSec', type: 'INTEGER', notnull: 0, dflt_value: null }),
            ]));
        expect(database!.prepare('PRAGMA table_info("User")').all())
            .toContainEqual(expect.objectContaining({ name: 'reviewDailyMinutes', type: 'INTEGER', notnull: 1, dflt_value: '30' }));
        closeDatabase();

        expect(() => execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff',
            '--from-url', 'file:' + databasePath, '--to-schema-datamodel', schemaPath, '--exit-code'], { stdio: 'pipe' })).not.toThrow();
        expect(deploy()).toContain('No pending migrations');
    }, 120000);

    it('分钟迁移仅追加列，上一版本的用户、错题、作答及外键行为保持完整', () => {
        deploy(migrations.filter(name => name < minutesMigration));
        openDatabase();
        database!.exec(`
            INSERT INTO "User" (id, email, password, name, updatedAt, reminderEnabled, reminderCredential)
                VALUES ('minutes-user', 'minutes@example.com', 'test-only', '迁移用户', '2026-11-08', true, 'test-only-credential');
            INSERT INTO "ErrorItem" (id, userId, originalImageUrl, questionText, updatedAt, reviewStage, nextReviewAt, reviewSyncedAt)
                VALUES ('minutes-item', 'minutes-user', 'original', '迁移前题目', '2026-11-08', 2, '2026-11-20', '2026-11-08');
            INSERT INTO "PracticeRecord" (id, userId, errorItemId, source, result, confidence, wrongAnswerText)
                VALUES ('minutes-record', 'minutes-user', 'minutes-item', 'review', 'correct', 'sure', '迁移前作答');
        `);
        const beforeUsers = rows('User');
        const beforeItems = rows('ErrorItem');
        const beforeRecords = rows('PracticeRecord');
        const foreignKeys = ['ErrorItem', 'PracticeRecord'].map(table => database!.prepare(`PRAGMA foreign_key_list("${table}")`).all());
        closeDatabase();

        expect(deploy()).toContain(minutesMigration);
        openDatabase();
        expect(rows('User')).toEqual(beforeUsers.map(row => ({ ...row, reviewDailyMinutes: 30 })));
        expect(rows('ErrorItem')).toEqual(beforeItems);
        expect(rows('PracticeRecord')).toEqual(beforeRecords.map(row => ({ ...row, durationSec: null })));
        expect(['ErrorItem', 'PracticeRecord'].map(table => database!.prepare(`PRAGMA foreign_key_list("${table}")`).all())).toEqual(foreignKeys);
        expect(database!.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
        expect(() => database!.exec('UPDATE "PracticeRecord" SET userId=\'missing-user\' WHERE id=\'minutes-record\''))
            .toThrow(/FOREIGN KEY/);
        expect(() => database!.exec('UPDATE "ErrorItem" SET userId=\'missing-user\' WHERE id=\'minutes-item\''))
            .toThrow(/FOREIGN KEY/);
        database!.exec('DELETE FROM "User" WHERE id=\'minutes-user\'');
        expect(rows('ErrorItem')).toEqual([]);
        expect(rows('PracticeRecord')).toEqual([]);
        expect(database!.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
        closeDatabase();
        expect(deploy()).toContain('No pending migrations');
    }, 120000);

    it.each([false, true])('旧库升级保留全部数据与关联（已应用配图比例迁移：%s）', (hasScale) => {
        // 模拟卷别分支合入前，主线已先发布时间戳更晚的配图比例迁移。
        deploy(migrations.filter((name) => name < groupMigration || (hasScale && name <= scaleMigration && name !== groupMigration)));
        openDatabase();
        seedLegacyData();
        if (hasScale) database!.exec('UPDATE "ErrorItem" SET figureScale=65');
        interface LegacyRow { [key: string]: unknown; userId?: string; paperLevel?: string; id?: string; }
        const beforeItems = rows('ErrorItem').map((row) => ({ ...(row as LegacyRow), questionType: (row as LegacyRow).questionType ?? null }));
        const beforeRelated = relatedTables.map((table) => rows(table).map((row) => {
            // 新增的 AI 数据授权列：旧用户升级后为空，需重新授权
            if (table === 'PracticeRecord') return { ...row, notes: null, gradeReason: null, answerImageUrl: null, recognizedAnswer: null, confidence: null, durationSec: null };
            if (table === 'User') return { reviewDailyMinutes: 30, ...row, aiDataConsentAt: row.aiDataConsentAt ?? null,
                reminderEnabled: row.reminderEnabled ?? 0, reminderChannel: row.reminderChannel ?? null,
                reminderCredential: row.reminderCredential ?? null, reminderTime: row.reminderTime ?? '09:00',
                reminderLastSentAt: row.reminderLastSentAt ?? null, reminderLastResult: row.reminderLastResult ?? null,
                reminderDay: row.reminderDay ?? null, reminderAttempts: row.reminderAttempts ?? 0,
                reminderCompletedDay: row.reminderCompletedDay ?? null, reminderLeaseUntil: row.reminderLeaseUntil ?? null };
            if (table === 'Subject' || table === 'KnowledgeTag') return { ...row, tagSet: row.tagSet ?? 'default' };
            if (table === 'ExamQuestion') return { ...row, figureScale: row.figureScale ?? 100, figureAlign: row.figureAlign ?? 'center', answerSpacePx: null, score: null, questionType: null };
            if (table === 'ExamPaper') return { ...row, mode: row.mode ?? 'generate', groupByType: row.groupByType ?? 0 };
            return row;
        }));
        closeDatabase();

        deploy();
        openDatabase();
        expectConstraints();
        const groups = rows('PaperGroup');
        expect(groups).toHaveLength(4);
        for (const item of beforeItems) {
            const group = groups.find((entry) => entry.userId === item.userId && entry.key === item.paperLevel);
            expect(rows('ErrorItem').find((entry) => entry.id === item.id)).toEqual({
                ...item, ...reviewDefaults, paperLevel: group?.id ?? null, figureScale: hasScale ? 65 : 100, figureAlign: 'center', answerSpacePx: null,
            });
        }
        expect(relatedTables.map(rows)).toEqual(beforeRelated);
        expect(() => database!.exec('UPDATE "ErrorItem" SET paperLevel=\'missing-group\' WHERE id=\'item-a\''))
            .toThrow(/FOREIGN KEY/);
        expect(() => database!.exec('UPDATE "ErrorItem" SET shortId=\'ShortA\' WHERE id=\'item-b\''))
            .toThrow(/UNIQUE/);
        const group = groups.find((entry) => entry.userId === 'user-1' && entry.key === 'a')!;
        database!.prepare('DELETE FROM "PaperGroup" WHERE id=?').run(group.id);
        expect(database!.prepare('SELECT paperLevel FROM "ErrorItem" WHERE id=\'item-a\'').get()).toEqual({ paperLevel: null });
        expect(relatedTables.map(rows)).toEqual(beforeRelated);
    }, 120000);

    it('补齐外键时保留已有的自定义分组、停用状态和配图比例', () => {
        deploy(migrations.filter((name) => name < relationMigration));
        openDatabase();
        database!.exec(`
            INSERT INTO "User" (id, email, password, updatedAt) VALUES ('existing-user', 'existing@example.com', 'test-only', '2026-10-01');
            INSERT INTO "PaperGroup" (id, userId, key, name, "order", isActive, updatedAt) VALUES
                ('custom-group', 'existing-user', NULL, '期中考试', 5, false, '2026-10-01');
            INSERT INTO "ErrorItem" (id, userId, originalImageUrl, paperLevel, figureScale, updatedAt)
                VALUES ('existing-item', 'existing-user', 'original', 'custom-group', 175, '2026-10-01');
        `);
        interface LegacyRow { [key: string]: unknown; questionType?: unknown; }
        const beforeItems = rows('ErrorItem').map((item) => ({ ...(item as LegacyRow), ...reviewDefaults, figureAlign: 'center', answerSpacePx: null, questionType: (item as LegacyRow).questionType ?? null }));
        const beforeGroups = rows('PaperGroup');
        closeDatabase();

        deploy();
        openDatabase();
        expectConstraints();
        expect(rows('ErrorItem')).toEqual(beforeItems);
        expect(rows('PaperGroup')).toEqual(beforeGroups);
    }, 120000);
});
