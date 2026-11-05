import type { ReminderMessage } from './schema';
export function barkPayload(message: ReminderMessage) { return { title: message.title, body: message.body, ...(message.url ? { url: message.url } : {}) }; }
