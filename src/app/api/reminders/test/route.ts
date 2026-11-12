import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { badRequest, forbidden, internalError } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { reminderView, remindersEnabled, sendUserReminder } from '@/lib/reminders/service';
import { allowsWebPushMutation, webPushConfig, webPushDeviceIdSchema } from '@/lib/reminders/web-push';
import { testReviewPush } from '@/lib/reminders/web-push-delivery';
import { WEB_PUSH_DEVICE_COOKIE } from '@/lib/reminders/schema';

/** 仅使用已保存的当前用户凭据；一分钟冷却，不消耗每日自动提醒次数。 */
export const POST = withUser(async (req, { user }) => {
    try {
        const body: unknown = await req.json().catch(() => null);
        if (body && typeof body === 'object' && 'deviceId' in body) {
            if (!allowsWebPushMutation(req)) return forbidden('WEB_PUSH_ORIGIN_FORBIDDEN');
            const id = webPushDeviceIdSchema.safeParse(body.deviceId);
            const config = remindersEnabled() ? webPushConfig() : null;
            if (!id.success || !config || new NextRequest(req.url, { headers: req.headers }).cookies.get(WEB_PUSH_DEVICE_COOKIE)?.value !== id.data) {
                return badRequest('WEB_PUSH_UNAVAILABLE');
            }
            const result = await testReviewPush(user.id, id.data, config);
            if (result === 'busy') return badRequest('REMINDER_BUSY');
            if (result === 'missing') return badRequest('WEB_PUSH_DEVICE_REQUIRED');
            return NextResponse.json({ result });
        }
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
