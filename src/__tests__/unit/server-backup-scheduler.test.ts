// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ overview: vi.fn(), trigger: vi.fn() }));
vi.mock("@/lib/server-backup/service", () => ({ backupOverview: mocks.overview, triggerBackup: mocks.trigger }));
vi.mock("@/lib/config", () => ({ getAppTimeZone: () => "Asia/Shanghai" }));
import { backupDue, startBackupScheduler } from "@/lib/server-backup/scheduler";
import { backupOptions } from "@/lib/server-backup/files";

afterEach(() => {
    const shared = globalThis as typeof globalThis & { __serverBackupTimer?: ReturnType<typeof setInterval> };
    clearInterval(shared.__serverBackupTimer);
    delete shared.__serverBackupTimer;
    vi.useRealTimers();
    vi.unstubAllEnvs();
});
describe("备份调度与配置", () => {
    it("按应用时区每天三点执行；只在启动补跑时使用24小时规则", () => {
        const now = new Date("2026-11-05T19:00:00Z");
        expect(backupDue("2026-11-04T18:00:00Z", now, "Asia/Shanghai", false)).toBe(true);
        expect(backupDue("2026-11-05T18:00:00Z", now, "UTC", false)).toBe(false);
        expect(backupDue(now.toISOString(), now, "Asia/Shanghai", false)).toBe(false);
        expect(backupDue("2026-11-04T18:59:00Z", now, "Asia/Shanghai", true)).toBe(true);
        expect(backupDue("2026-11-05T18:00:00Z", now, "Asia/Shanghai", true)).toBe(false);
    });
    it("构建不注册，重复启动只有一个定时器；五分钟后补跑", async () => {
        vi.useFakeTimers();
        vi.stubEnv("NEXT_PHASE", "phase-production-build");
        startBackupScheduler();
        expect(vi.getTimerCount()).toBe(0);
        vi.stubEnv("NEXT_PHASE", "");
        vi.stubEnv("BACKUP_ENABLED", "true");
        mocks.overview.mockResolvedValue({ running: false, status: { lastSuccessAt: null } });
        startBackupScheduler(); startBackupScheduler();
        expect(vi.getTimerCount()).toBe(1);
        await vi.advanceTimersByTimeAsync(4 * 60000);
        expect(mocks.trigger).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(60000);
        expect(mocks.trigger).toHaveBeenCalledTimes(1);
    });
    it("禁用后不会备份，非法保留份数校验失败", async () => {
        vi.useFakeTimers();
        vi.stubEnv("BACKUP_ENABLED", "false");
        startBackupScheduler();
        await vi.advanceTimersByTimeAsync(6 * 60000);
        expect(mocks.overview).not.toHaveBeenCalled();
        vi.stubEnv("BACKUP_KEEP", "0");
        expect(() => backupOptions()).toThrow();
    });
    it("镜像不能覆盖在线图片目录", () => {
        vi.stubEnv("IMAGE_STORAGE_DIR", "/data/images");
        vi.stubEnv("BACKUP_DIR", "/data");
        expect(() => backupOptions()).toThrow("BACKUP_IMAGE_DIRECTORY_OVERLAP");
    });
    it("默认目录跟随安装包数据库目录", () => {
        vi.stubEnv("DATABASE_URL", "file:/user/data/wrong-notebook.db");
        vi.stubEnv("BACKUP_DIR", "");
        vi.stubEnv("BACKUP_KEEP", undefined);
        expect(backupOptions()).toMatchObject({ directory: "/user/data/backups", keep: 7 });
    });
});
