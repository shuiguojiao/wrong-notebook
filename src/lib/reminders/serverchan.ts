import type { ReminderMessage } from './schema';
export function serverchanPayload(message: ReminderMessage) { return { title: message.title, desp: [message.body, message.url].filter(Boolean).join('\n\n') }; }
