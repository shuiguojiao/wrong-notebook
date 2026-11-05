// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ warn: vi.fn(), announce: vi.fn(), start: vi.fn() }));
vi.mock("@/lib/global-proxy", () => ({ setupGlobalProxy: vi.fn() }));
vi.mock("@/lib/minimax-code/checkin", () => ({ startCheckinScheduler: vi.fn() }));
vi.mock("@/lib/initialization", () => ({ announceSetupLink: mocks.announce }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ warn: mocks.warn }) }));
vi.mock("@/lib/server-backup/scheduler", () => ({ startBackupScheduler: mocks.start }));
import { register } from "@/instrumentation";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it("备份调度启动异常仅记日志，仍完成应用初始化", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "");
    mocks.start.mockImplementation(() => { throw new Error("启动异常"); });
    await expect(register()).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalled();
    expect(mocks.announce).toHaveBeenCalled();
});
it("备份模块导入失败也不阻止 register", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "");
    vi.doMock("@/lib/server-backup/scheduler", () => { throw new Error("模块加载异常"); });
    const { register: registerAgain } = await import("@/instrumentation");
    await expect(registerAgain()).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalled();
    expect(mocks.announce).toHaveBeenCalled();
});
