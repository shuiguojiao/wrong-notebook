
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { setupGlobalProxy } = await import('./lib/global-proxy');
        setupGlobalProxy();

        // 构建阶段不启动定时任务
        if (process.env.NEXT_PHASE !== 'phase-production-build') {
            const { startCheckinScheduler } = await import('./lib/minimax-code/checkin');
            startCheckinScheduler();

            try {
                const { startBackupScheduler } = await import("./lib/server-backup/scheduler");
                startBackupScheduler();
            } catch (error) {
                const { createLogger } = await import("./lib/logger");
                createLogger("instrumentation").warn({ error }, "备份调度启动失败，应用继续启动");
            }

            try {
                const { startReminderScheduler } = await import("./lib/reminders/scheduler");
                startReminderScheduler();
            } catch (error) {
                const { createLogger } = await import("./lib/logger");
                createLogger("instrumentation").warn({ error }, "复习提醒调度启动失败，应用继续启动");
            }

            // 全新安装还没有管理员时，在启动日志中打印一次性初始化链接
            const { announceSetupLink } = await import('./lib/initialization');
            await announceSetupLink();
        }
    }
}
