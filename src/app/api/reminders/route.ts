import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { badRequest, internalError } from '@/lib/api-errors';
import { getAppConfig } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { reminderSettingsSchema } from '@/lib/reminders/schema';
import { reminderAddress, resolveReminderAddress } from '@/lib/reminders/address';
import { reminderView } from '@/lib/reminders/service';

export const GET = withUser(async (_req, { user }) => NextResponse.json(reminderView(user)));
export const PUT = withUser(async (req, { user }) => {
    try {
        const parsed = reminderSettingsSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) return badRequest('INVALID_REMINDER_SETTINGS');
        const data = parsed.data;
        const changed = data.reminderChannel !== user.reminderChannel;
        // 留空（省略字段）保留原凭据；切换渠道必须重新填写，不把打码值当成凭据。
        const credential = data.reminderCredential ?? (changed ? null : user.reminderCredential);
        if (data.reminderEnabled && (!data.reminderChannel || !credential)) return badRequest('MISSING_REMINDER_CREDENTIAL');
        if (credential && data.reminderChannel) {
            try {
                const policy = getAppConfig();
                // 已被管理员禁用的自定义渠道仍允许用户关闭。
                if (data.reminderEnabled || data.reminderCredential || changed) {
                    const url = reminderAddress(data.reminderChannel, credential, policy);
                    if (data.reminderChannel === 'custom') await resolveReminderAddress(url, policy.allowPrivateReminders === true, AbortSignal.timeout(10_000));
                }
            } catch { return badRequest('INVALID_REMINDER_ADDRESS'); }
        }
        const saved = await prisma.user.update({ where: { id: user.id }, data: { ...data, reminderCredential: credential } });
        return NextResponse.json(reminderView(saved));
    } catch { return internalError('REMINDER_SAVE_FAILED'); }
});
