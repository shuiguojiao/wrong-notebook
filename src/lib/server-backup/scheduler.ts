import "server-only";

import { getAppTimeZone } from "../config";
import { formatDateTime } from "../date-time";
import { createLogger } from "../logger";
import { backupOptions, errorCode } from "./files";
import { backupOverview, triggerBackup } from "./service";

const logger = createLogger("server-backup:scheduler");
const shared = globalThis as typeof globalThis & { __serverBackupTimer?: ReturnType<typeof setInterval> };
const DAY = 24 * 60 * 60 * 1000;

export function backupDue(lastSuccessAt: string | null, now: Date, timeZone: string, startup: boolean): boolean {
    if (startup) return !lastSuccessAt || now.getTime() - Date.parse(lastSuccessAt) > DAY;
    return formatDateTime(now, "HH", timeZone) === "03"
        && (!lastSuccessAt || formatDateTime(lastSuccessAt, "yyyy-MM-dd", timeZone) !== formatDateTime(now, "yyyy-MM-dd", timeZone));
}

/** 启动五分钟后补跑，之后每分钟检查应用时区；失败最多每小时重试一次。 */
export function startBackupScheduler(): void {
    if (process.env.NEXT_PHASE === "phase-production-build" || shared.__serverBackupTimer) return;
    let lastAttempt = 0;
    const tick = async (startup: boolean) => {
        try {
            if (!backupOptions().enabled || Date.now() - lastAttempt < 60 * 60 * 1000) return;
            const overview = await backupOverview();
            if (!overview.running && backupDue(overview.status.lastSuccessAt, new Date(), getAppTimeZone(), startup)) {
                lastAttempt = Date.now();
                triggerBackup();
            }
        } catch (error) { logger.warn({ code: errorCode(error) }, "定时备份检查失败"); }
    };
    const readyAt = Date.now() + 5 * 60 * 1000;
    let first = true;
    shared.__serverBackupTimer = setInterval(() => {
        if (Date.now() < readyAt) return;
        const startup = first;
        first = false;
        void tick(startup);
    }, 60 * 1000);
    shared.__serverBackupTimer.unref?.();
}
