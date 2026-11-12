import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { badRequest, forbidden, internalError } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { remindersEnabled } from '@/lib/reminders/service';
import { MAX_WEB_PUSH_DEVICES, WEB_PUSH_DEVICE_COOKIE } from '@/lib/reminders/schema';
import { allowsWebPushMutation, webPushConfig, webPushDeviceId, webPushDeviceIdSchema, webPushSubscriptionSchema } from '@/lib/reminders/web-push';

export const GET = withUser(async (_req, { user }) => {
    const config = remindersEnabled() ? webPushConfig() : null;
    const devices = await prisma.webPushSubscription.findMany({
        where: { userId: user.id },
        select: { id: true, createdAt: true, vapidKey: true },
        orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({
        publicKey: config?.publicKey ?? null,
        devices: devices.map(({ id, createdAt, vapidKey }) => ({
            id, createdAt, needsRenewal: !!config && vapidKey !== config.publicKey,
        })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
});

export const POST = withUser(async (req, { user }) => {
    if (!allowsWebPushMutation(req)) return forbidden('WEB_PUSH_ORIGIN_FORBIDDEN');
    const config = remindersEnabled() ? webPushConfig() : null;
    if (!config) return badRequest('WEB_PUSH_UNAVAILABLE');
    const parsed = webPushSubscriptionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success || parsed.data.vapidKey !== config.publicKey) return badRequest('INVALID_WEB_PUSH_SUBSCRIPTION');
    const { endpoint, keys } = parsed.data;
    const id = webPushDeviceId(endpoint);
    try {
        const registered = await prisma.$transaction(async tx => {
            const existing = await tx.webPushSubscription.findUnique({ where: { id }, select: { userId: true } });
            if (existing && existing.userId !== user.id) return false;
            const data = { endpoint, ...keys, vapidKey: config.publicKey };
            if (existing) {
                await tx.webPushSubscription.update({ where: { id }, data });
            } else {
                const count = await tx.webPushSubscription.count({ where: { userId: user.id } });
                if (count >= MAX_WEB_PUSH_DEVICES) return false;
                await tx.webPushSubscription.create({ data: { id, userId: user.id, ...data } });
            }
            return true;
        });
        if (!registered) return badRequest('WEB_PUSH_DEVICE_UNAVAILABLE');
        const response = NextResponse.json({ id });
        response.cookies.set(WEB_PUSH_DEVICE_COOKIE, id, {
            httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 60 * 60,
        });
        return response;
    } catch {
        // 订阅地址和加密参数不能进入错误日志。
        return internalError('WEB_PUSH_REGISTER_FAILED');
    }
});

export const DELETE = withUser(async (req, { user }) => {
    if (!allowsWebPushMutation(req)) return forbidden('WEB_PUSH_ORIGIN_FORBIDDEN');
    const id = webPushDeviceIdSchema.safeParse(new URL(req.url).searchParams.get('id'));
    if (!id.success) return badRequest('INVALID_WEB_PUSH_DEVICE');
    await prisma.webPushSubscription.deleteMany({ where: { id: id.data, userId: user.id } });
    return NextResponse.json({ success: true });
});
