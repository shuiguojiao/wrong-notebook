import { describe, expect, it } from "vitest";
import { backupExamAttemptSchema, BACKUP_VERSION, parseBackupFile } from "@/lib/backup/format";

describe("parseBackupFile", () => {
    const sourceBackup = () => ({
        version: 17, user: { id: 'u1' },
        sourcePages: [{ id: 'p1', userId: 'u1', sha256: 'a'.repeat(64), imageUrl: '', width: 100, height: 200, origin: 'agent', fileName: null, pageNumber: null, createdAt: '2026-11-01T00:00:00.000Z' }],
        errorItems: [{ id: 'e1', userId: 'u1', checkStatus: 'pass', checkIssues: '[]', checkedAt: null, checkVersion: 1 }],
        questionRegions: [{ id: 'r1', errorItemId: 'e1', pageId: 'p1', order: 0, x: 0, y: 0, width: 1, height: 1 }],
    });

    it('接受第 17 版的出处、位置与检查字段', () => {
        expect(parseBackupFile(sourceBackup()).success).toBe(true);
    });

    it.each([
        { x: -0.1 }, { y: 1.1 }, { x: 0.5, width: 0.6 }, { height: 0 },
        { width: Number.NaN }, { order: -1 }, { pageId: 'missing' }, { errorItemId: 'missing' },
    ])('拒绝无效区域 %j', patch => {
        const backup = sourceBackup();
        Object.assign(backup.questionRegions[0], patch);
        expect(parseBackupFile(backup).success).toBe(false);
    });

    it.each([{ sha256: 'bad' }, { width: 0 }, { height: -1 }, { origin: 'other' }, { pageNumber: 0 }])('拒绝无效出处 %j', patch => {
        const backup = sourceBackup();
        Object.assign(backup.sourcePages[0], patch);
        expect(parseBackupFile(backup).success).toBe(false);
    });

    it.each([{ checkStatus: 'other' }, { checkIssues: '{}' }, { checkIssues: '[' }, { checkedAt: 'bad' }, { checkVersion: -1 }])('拒绝无效检查记录 %j', patch => {
        const backup = sourceBackup();
        Object.assign(backup.errorItems[0], patch);
        expect(parseBackupFile(backup).success).toBe(false);
    });

    it('拒绝跨用户区域引用与重复 ID', () => {
        const backup = sourceBackup();
        backup.sourcePages[0].userId = 'other';
        expect(parseBackupFile(backup).success).toBe(false);
        backup.sourcePages[0].userId = 'u1';
        backup.sourcePages.push(backup.sourcePages[0]);
        expect(parseBackupFile(backup).success).toBe(false);
        backup.sourcePages.pop();
        backup.questionRegions.push(backup.questionRegions[0]);
        expect(parseBackupFile(backup).success).toBe(false);
    });

    it("接受合法的最小 v1 备份文件", () => {
        const minimal = {
            version: 1,
            exportedAt: "2024-01-01T00:00:00.000Z",
            user: { id: "u1", email: "a@example.com", name: null },
            errorItems: [],
        };
        const result = parseBackupFile(minimal);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.version).toBe(1);
            expect(result.data.user.email).toBe("a@example.com");
            expect(result.data.errorItems).toEqual([]);
        }
    });

    it("接受当前版本的完整备份文件", () => {
        const full = {
            version: BACKUP_VERSION,
            exportedAt: "2026-11-04T00:00:00.000Z",
            scope: "user",
            user: {
                id: "u1",
                email: "a@example.com",
                name: "张三",
                educationStage: "middle",
                enrollmentYear: 2024,
                gradeRecognitionMode: "auto",
                fixedGradeSemester: null,
                role: "user",
                confirmBeforeImport: true,
                questionDuplicateThreshold: 80,
                masteryThreshold: 80,
                enableGeogebra: false,
                enableSvgAnimation: true,
                themePreference: "system",
            },
            subjects: [],
            systemTags: [],
            customTags: [],
            errorItems: [],
            reviewSchedules: [],
            practiceRecords: [],
            examPapers: [],
            paperGroups: [],
            ttsSpeeches: {},
            importTasks: [],
            importBatches: [],
            extensions: {},
        };
        const result = parseBackupFile(full);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.version).toBe(BACKUP_VERSION);
        }
    });

    it.each([undefined, 0, 2])("接受旧版备份的可选缺图元信息 %s", (missingImages) => {
        const result = parseBackupFile({ version: 13, user: {}, errorItems: [], ...(missingImages === undefined ? {} : { missingImages }) });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.missingImages).toBe(missingImages);
        expect(BACKUP_VERSION).toBe(18);
    });

    it.each([
        { reviewStage: -1 }, { reviewStage: 6 }, { reviewWrongStreak: -1 },
        { reviewOverride: 'completed' }, { reviewOverrideAt: '2026-11-08T00:00:00Z' }, { reviewOverride: 'invalid' }, { reviewOverrideAt: 'invalid' }, { nextReviewAt: 'not-a-date' },
    ])('拒绝无效的第 16 版调度字段 %j', fields => {
        expect(parseBackupFile({ version: 16, user: {}, errorItems: [{ id: 'q1', ...fields }] }).success).toBe(false);
    });
    it("拒绝缺少 user 的文件", () => {
        const result = parseBackupFile({ version: 1, errorItems: [] });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBeTruthy();
        }
    });

    it("拒绝 errorItems 不是数组的文件", () => {
        const result = parseBackupFile({
            version: 1,
            user: { id: "u1", email: "a@example.com" },
            errorItems: {},
        });
        expect(result.success).toBe(false);
    });

    it("保留未知顶层字段", () => {
        const withUnknown = {
            version: 1,
            user: { id: "u1", email: "a@example.com" },
            errorItems: [],
            futureField: { foo: "bar" },
        };
        const result = parseBackupFile(withUnknown);
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data as Record<string, unknown>).futureField).toEqual({ foo: "bar" });
        }
    });
    it('第 16 版接受分钟偏好和可空时长，旧文件缺字段仍兼容', () => {
        const result = parseBackupFile({ version: 16, user: { reviewDailyMinutes: 45 }, errorItems: [], practiceRecords: [{ durationSec: 123 }, { durationSec: null }] });
        expect(result.success).toBe(true);
        if (result.success) { expect(result.data.user.reviewDailyMinutes).toBe(45); expect(result.data.practiceRecords?.[0].durationSec).toBe(123); }
        expect(parseBackupFile({ version: 15, user: {}, errorItems: [] }).success).toBe(true);
    });
    it.each([9, 11, 181, 30.5, '30', null])('备份拒绝非法每日分钟数 %s', reviewDailyMinutes => {
        expect(parseBackupFile({ version: 16, user: { reviewDailyMinutes }, errorItems: [] }).success).toBe(false);
    });

});


describe('第 18 版作答备份校验', () => {
    const fixture = () => ({
        version: 18, user: { id: 'u' }, errorItems: [],
        examPapers: [{ id: 'p', userId: 'u', questions: [{ id: 'q' }] }],
        examAttempts: [{
            id: 'a', userId: 'u', paperId: 'p', kind: 'online', status: 'reviewing',
            startedAt: '2026-11-10T00:00:00.000Z', submittedAt: null, confirmedAt: null,
            durationSec: 60, pageImages: null as string | null, createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z',
            answers: [{ id: 'answer', attemptId: 'a', examQuestionId: 'q', answerText: '2', answerImageUrl: null as string | null, gradingImages: null, gradingRetries: 0,
                flagged: false, pageIndex: null, region: null, recognizedAnswer: null, handMark: null, aiResult: null, aiReason: null, finalResult: 'correct', updatedAt: '2026-11-10T00:00:00.000Z' }],
        }],
        practiceRecords: [{ id: 'record', userId: 'u', examQuestionId: 'q', examAttemptId: 'a' }],
    });
    it('接受完整作答关联', () => expect(parseBackupFile(fixture()).success).toBe(true));
    it.each([{ kind: 'bad' }, { status: 'bad' }, { durationSec: -1 }, { paperId: 'missing' }, { userId: 'other' }, { pageImages: '{}' }])('拒绝无效作答 %j', patch => {
        const data = fixture(); Object.assign(data.examAttempts[0], patch);
        expect(parseBackupFile(data).success).toBe(false);
    });
    it.each([{ attemptId: 'other' }, { examQuestionId: 'missing' }, { finalResult: 'unknown' }, { answerImageUrl: 'local-image:bad' }, { pageIndex: 8 }, { region: '[]' }])('拒绝无效答案 %j', patch => {
        const data = fixture(); Object.assign(data.examAttempts[0].answers[0], patch);
        expect(parseBackupFile(data).success).toBe(false);
    });
    it('拒绝重复逐题答案、重复未完成作答与跨用户练习关联', () => {
        const data = fixture();
        data.examAttempts[0].answers.push(data.examAttempts[0].answers[0]);
        expect(parseBackupFile(data).success).toBe(false);
        data.examAttempts[0].answers.pop();
        data.examAttempts.push({ ...data.examAttempts[0], id: 'a2', answers: [] });
        expect(parseBackupFile(data).success).toBe(false);
        data.examAttempts.pop();
        data.practiceRecords[0].userId = 'other';
        expect(parseBackupFile(data).success).toBe(false);
    });
});


it('第 18 版作答必须包含判题原图和重判次数字段', () => {
    const parsed = backupExamAttemptSchema.safeParse({
        id: 'a', userId: 'u', paperId: 'p', kind: 'online', status: 'answering',
        startedAt: '2026-11-10T00:00:00Z', submittedAt: null, confirmedAt: null, durationSec: null,
        pageImages: null, createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z',
        answers: [{ id: 'b', attemptId: 'a', examQuestionId: 'q', answerText: null, answerImageUrl: null, flagged: false, pageIndex: null, region: null, recognizedAnswer: null, handMark: null, aiResult: null, aiReason: null, finalResult: null, updatedAt: '2026-11-10T00:00:00Z' }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.map(issue => issue.path.at(-1))).toEqual(['gradingImages', 'gradingRetries']);
});
