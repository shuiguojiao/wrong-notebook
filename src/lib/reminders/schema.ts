import { z } from 'zod';

export const CREDENTIAL_REMINDER_CHANNELS = ['bark', 'serverchan', 'pushplus', 'wecom', 'feishu', 'dingtalk', 'custom'] as const;
export const REMINDER_CHANNELS = [...CREDENTIAL_REMINDER_CHANNELS, 'web_push'] as const;
export const WEB_PUSH_DEVICE_COOKIE = '__Host-wrong-notebook-push';
export const MAX_WEB_PUSH_DEVICES = 6;
export type ReminderChannel = typeof REMINDER_CHANNELS[number];
export type CredentialReminderChannel = typeof CREDENTIAL_REMINDER_CHANNELS[number];

export function isCredentialReminderChannel(value: string | null): value is CredentialReminderChannel {
    return CREDENTIAL_REMINDER_CHANNELS.some(channel => channel === value);
}
export const reminderTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const reminderSettingsSchema = z.object({
    reminderEnabled: z.boolean(),
    reminderChannel: z.enum(REMINDER_CHANNELS).nullable(),
    reminderCredential: z.string().trim().min(1).max(2048).optional(),
    reminderTime: reminderTimeSchema,
}).strict();
export interface ReminderMessage { title: string; body: string; url?: string }
export interface ReminderPolicy { allowCustomReminders?: boolean; allowPrivateReminders?: boolean }
export function maskCredential(value: string | null): string | null {
    // 很短的凭据不暴露完整内容
    return value ? `••••${value.length > 4 ? value.slice(-4) : ''}` : null;
}
