import 'server-only';

import { prisma } from '@/lib/prisma';
import { MAX_WEB_PUSH_DEVICES } from './schema';
import { sendWebPush, webPushConfig } from './web-push';

type PushConfig = NonNullable<ReturnType<typeof webPushConfig>>;
const TEST_COOLDOWN_MS = 60_000;
const pushTitle = '错题本复习提醒';

export async function deliverReviewPush(userId: string, day: string, ttl: number, config: PushConfig) {
    const devices = await prisma.webPushSubscription.findMany({ where: { userId, vapidKey: config.publicKey }, take: MAX_WEB_PUSH_DEVICES });
    const outcomes = await Promise.all(devices.map(async device => {
        if (device.deliveryDay === day && device.deliveryStatus !== 'retry') return device.deliveryStatus;
        const where = { id: device.id, userId, vapidKey: config.publicKey, createdAt: device.createdAt };
        // 发送前先占位，进程中断时保留未知结果，其他设备仍可单独重试。
        const claimed = await prisma.webPushSubscription.updateMany({
            where: {
                ...where, deliveryDay: device.deliveryDay, deliveryStatus: device.deliveryStatus,
                user: { isActive: true, reminderEnabled: true, reminderChannel: 'web_push' },
            },
            data: { deliveryDay: day, deliveryStatus: 'unknown' },
        });
        if (!claimed.count) return null;
        const outcome = await sendWebPush(device, config, {
            title: pushTitle, body: '今天有错题待复习', tag: `review-${day}`,
        }, ttl);
        if (outcome === 'expired') await prisma.webPushSubscription.deleteMany({ where });
        else await prisma.webPushSubscription.updateMany({ where: { ...where, deliveryDay: day }, data: { deliveryStatus: outcome } });
        return outcome;
    }));
    return {
        accepted: outcomes.includes('accepted'),
        retry: outcomes.includes('retry'),
    };
}

export async function testReviewPush(userId: string, id: string, config: PushConfig) {
    const now = new Date();
    const device = await prisma.webPushSubscription.findFirst({ where: { id, userId, vapidKey: config.publicKey } });
    if (!device) return 'missing';
    const where = { id, userId, vapidKey: config.publicKey, createdAt: device.createdAt };
    const claimed = await prisma.webPushSubscription.updateMany({
        where: { ...where, OR: [{ lastTestAt: null }, { lastTestAt: { lte: new Date(now.getTime() - TEST_COOLDOWN_MS) } }] },
        data: { lastTestAt: now },
    });
    if (!claimed.count) return 'busy';
    const result = await sendWebPush(device, config, {
        title: pushTitle, body: '这是一条测试通知，点击打开错题本', tag: 'review-test',
    }, 120);
    if (result === 'expired') await prisma.webPushSubscription.deleteMany({ where });
    return result === 'accepted' ? 'accepted' : 'failed';
}
