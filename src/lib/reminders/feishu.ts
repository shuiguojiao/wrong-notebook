import type { ReminderMessage } from './schema';
export function feishuPayload(message: ReminderMessage) { return { msg_type: 'text', content: { text: [message.title, message.body, message.url].filter(Boolean).join('\n') } }; }
