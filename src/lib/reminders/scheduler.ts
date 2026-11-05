import 'server-only';

import { createLogger } from '@/lib/logger';
import { runReminders } from './service';
const shared = globalThis as typeof globalThis & { __reviewReminderTimer?: ReturnType<typeof setInterval> };
export function startReminderScheduler() {
    if (process.env.NEXT_PHASE === 'phase-production-build' || shared.__reviewReminderTimer) return;
    let running = false;
    shared.__reviewReminderTimer = setInterval(() => {
        if (running) return;
        running = true;
        void runReminders().catch(() => createLogger('reminders').warn({ result: 'failed' }, '提醒调度检查失败')).finally(() => { running = false; });
    }, 60_000);
    shared.__reviewReminderTimer.unref?.();
}
