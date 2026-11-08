import { describe, expect, it } from "vitest";
import { BACKUP_VERSION, parseBackupFile } from "@/lib/backup/format";

describe("parseBackupFile", () => {
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
        expect(BACKUP_VERSION).toBe(16);
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
