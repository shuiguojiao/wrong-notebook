import 'server-only';

import type { User } from '@prisma/client';
import { getAppConfig, getAppTimeZone } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/date-time';
import { createLogger } from '@/lib/logger';
import { getDueReviewSummary } from '@/lib/review-due';
import { createReminderChannel } from './channel';
import { REMINDER_CHANNELS, maskCredential } from './schema';
import type { ReminderChannel } from './schema';

const logger = createLogger('reminders');
const RETRY_DELAY_MS = 30 * 60_000;
export function remindersEnabled() { return process.env.REVIEW_REMINDERS_ENABLED !== 'false'; }
export function reviewUrl(): string | undefined {
    try {
        if (!process.env.NEXTAUTH_URL) return undefined;
        const base = new URL(process.env.NEXTAUTH_URL);
        if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) return undefined;
        return new URL('/review', base).href;
    } catch { return undefined; }
}
export function reminderView(user: User) {
    const policy = getAppConfig();
    return {
        reminderEnabled: user.reminderEnabled, reminderChannel: user.reminderChannel,
        reminderCredential: maskCredential(user.reminderCredential), reminderTime: user.reminderTime,
        reminderLastSentAt: user.reminderLastSentAt, reminderLastResult: user.reminderLastResult,
        available: remindersEnabled(), hasSiteUrl: !!reviewUrl(), timeZone: getAppTimeZone(),
        allowCustomReminders: policy.allowCustomReminders === true,
    };
}
export function reminderDue(user: Pick<User, 'reminderTime' | 'reminderDay' | 'reminderAttempts' | 'reminderCompletedDay' | 'reminderLeaseUntil'>, now: Date, zone: string) {
    const day = formatDateTime(now, 'yyyy-MM-dd', zone);
    return formatDateTime(now, 'HH:mm', zone) >= user.reminderTime
        && user.reminderCompletedDay !== day && (user.reminderDay !== day || user.reminderAttempts < 3)
        && (!user.reminderLeaseUntil || user.reminderLeaseUntil <= now);
}
export async function sendUserReminder(user: User, body: string) {
    if (!remindersEnabled() || !user.isActive || !REMINDER_CHANNELS.includes(user.reminderChannel as ReminderChannel) || !user.reminderCredential) return 'failed' as const;
    const result = await createReminderChannel(user.reminderChannel as ReminderChannel, user.reminderCredential, getAppConfig()).send({ title: '错题本复习提醒', body, url: reviewUrl() });
    // 不记录异常对象、第三方响应或凭据
    logger.info({ channel: user.reminderChannel, result }, '复习提醒发送结果');
    return result;
}

export async function runReminders(now = new Date()) {
    if (!remindersEnabled()) return;
    const zone = getAppTimeZone();
    const day = formatDateTime(now, 'yyyy-MM-dd', zone);
    const users = await prisma.user.findMany({ where: { isActive: true, reminderEnabled: true } });
    for (const user of users) {
        let claimedByUs = false;
        let deliveryStarted = false;
        const startedAt = Date.now();
        const retryAt = () => new Date(now.getTime() + (Date.now() - startedAt) + RETRY_DELAY_MS);
        try {
            if (!reminderDue(user, now, zone)) continue;
            // 比较并交换 + 有界租约；先标记当天完成，崩溃后不盲目重发已可能接受的消息。
            const claimed = await prisma.user.updateMany({
                where: { id: user.id, isActive: true, reminderEnabled: true,
                    reminderDay: user.reminderDay, reminderAttempts: user.reminderAttempts,
                    reminderCompletedDay: user.reminderCompletedDay, reminderLeaseUntil: user.reminderLeaseUntil,
                    reminderTime: user.reminderTime, reminderCredential: user.reminderCredential, reminderChannel: user.reminderChannel },
                data: { reminderDay: day, reminderCompletedDay: day, reminderAttempts: user.reminderDay === day ? user.reminderAttempts + 1 : 1, reminderLeaseUntil: new Date(now.getTime() + 60_000) },
            });
            if (!claimed.count) continue;
            claimedByUs = true;
            const summary = await getDueReviewSummary(user.id, now, zone);
            if (!summary.total) {
                await prisma.user.update({ where: { id: user.id }, data: { reminderCompletedDay: day, reminderLastResult: 'no_due', reminderLeaseUntil: null } });
                continue;
            }
            const subjects = Object.entries(summary.subjects).map(([name, count]) => `${name} ${count}`).join('、');
            deliveryStarted = true;
            const result = await sendUserReminder(user, `今天有 ${summary.total} 道错题待复习（${subjects}）${summary.estimatedMinutes ? `，约 ${Math.ceil(summary.estimatedMinutes)} 分钟` : ''}`);
            await prisma.user.update({ where: { id: user.id }, data: {
                reminderLastSentAt: now, reminderLastResult: result, reminderLeaseUntil: result === 'failed' ? retryAt() : null,
                reminderCompletedDay: result === 'accepted' ? day : null,
            } });
        } catch {
            logger.warn({ channel: user.reminderChannel, result: 'failed' }, '复习提醒检查失败');
            // 无法确认发送阶段的异常保留当天标记，避免重发；不影响其他用户。
            if (claimedByUs) await prisma.user.updateMany({ where: { id: user.id }, data: {
                reminderLastResult: 'failed', ...(!deliveryStarted ? { reminderCompletedDay: null, reminderLeaseUntil: retryAt() } : {}),
            } }).catch(() => undefined);
        }
    }
}
