import type { ReminderMessage } from './schema';
export function wecomPayload(message: ReminderMessage) { return { msgtype: 'text', text: { content: [message.title, message.body, message.url].filter(Boolean).join('\n') } }; }
