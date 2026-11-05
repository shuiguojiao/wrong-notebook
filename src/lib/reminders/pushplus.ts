import type { ReminderMessage } from './schema';
export function pushplusPayload(message: ReminderMessage, token: string) { return { token, title: message.title, content: [message.body, message.url].filter(Boolean).join('\n'), template: 'txt' }; }
