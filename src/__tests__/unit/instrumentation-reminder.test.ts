// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ warn: vi.fn(), announce: vi.fn(), start: vi.fn() }));
vi.mock('@/lib/global-proxy', () => ({ setupGlobalProxy: vi.fn() }));
vi.mock('@/lib/minimax-code/checkin', () => ({ startCheckinScheduler: vi.fn() }));
vi.mock('@/lib/server-backup/scheduler', () => ({ startBackupScheduler: vi.fn() }));
vi.mock('@/lib/reminders/scheduler', () => ({ startReminderScheduler: mocks.start }));
vi.mock('@/lib/initialization', () => ({ announceSetupLink: mocks.announce }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn: mocks.warn }) }));
import { register } from '@/instrumentation';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });
it('复习提醒调度启动异常只记日志，应用继续初始化', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs'); vi.stubEnv('NEXT_PHASE', '');
    const error = new Error('启动异常');
    mocks.start.mockImplementationOnce(() => { throw error; });
    await expect(register()).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledWith({ error }, '复习提醒调度启动失败，应用继续启动');
    expect(mocks.announce).toHaveBeenCalled();
});
it('复习提醒调度模块加载失败时应用继续初始化', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs'); vi.stubEnv('NEXT_PHASE', '');
    vi.doMock('@/lib/reminders/scheduler', () => { throw new Error('模块加载异常'); });
    const { register: registerAgain } = await import('@/instrumentation');
    await expect(registerAgain()).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalled();
    expect(mocks.announce).toHaveBeenCalled();
});
