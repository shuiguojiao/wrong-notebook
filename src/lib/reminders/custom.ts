import type { ReminderMessage } from './schema';
export function customPayload(message: ReminderMessage) { return { ...message }; }
