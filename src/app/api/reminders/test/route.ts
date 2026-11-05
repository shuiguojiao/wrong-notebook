import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { badRequest, internalError } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { reminderView, remindersEnabled, sendUserReminder } from '@/lib/reminders/service';

/** 仅使用已保存的当前用户凭据；一分钟冷却，不消耗每日自动提醒次数。 */
export const POST = withUser(async (_req, { user }) => {
    try {
        if (!remindersEnabled() || !user.reminderChannel || !user.reminderCredential) return badRequest('REMINDER_UNAVAILABLE');
        const now = new Date();
        const claimed = await prisma.user.updateMany({ where: { id: user.id, isActive: true,
            OR: [{ reminderLeaseUntil: null }, { reminderLeaseUntil: { lte: now } }] },
            data: { reminderLeaseUntil: new Date(now.getTime() + 60_000) } });
        if (!claimed.count) return badRequest('REMINDER_BUSY');
        const result = await sendUserReminder(user, '这是一条测试消息，打开错题本开始复习吧。');
        const saved = await prisma.user.update({ where: { id: user.id }, data: { reminderLastSentAt: now, reminderLastResult: result } });
        return NextResponse.json({ ...reminderView(saved), result });
    } catch { return internalError('REMINDER_TEST_FAILED'); }
});
