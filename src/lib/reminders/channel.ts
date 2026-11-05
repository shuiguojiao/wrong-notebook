import 'server-only';

import { Agent } from 'undici';
import { pinnedLookup, reminderAddress, resolveReminderAddress } from './address';
import { barkPayload } from './bark';
import { serverchanPayload } from './serverchan';
import { pushplusPayload } from './pushplus';
import { wecomPayload } from './wecom';
import { feishuPayload } from './feishu';
import { dingtalkPayload } from './dingtalk';
import { customPayload } from './custom';
import type { ReminderChannel, ReminderMessage, ReminderPolicy } from './schema';

/** 所有渠道统一为 send({ title, body, url })；对外仅返回固定结果，避免响应回显凭据。 */
export function createReminderChannel(channel: ReminderChannel, credential: string, policy: ReminderPolicy) {
    return { async send(message: ReminderMessage): Promise<'accepted' | 'failed'> {
        let agent: Agent | undefined;
        try {
            const url = reminderAddress(channel, credential, policy);
            const signal = AbortSignal.timeout(10_000);
            const target = await resolveReminderAddress(url, channel === 'custom' && policy.allowPrivateReminders === true, signal);
            agent = new Agent({ connect: { lookup: pinnedLookup(target) } });
            const body = channel === 'bark' ? barkPayload(message) : channel === 'serverchan' ? serverchanPayload(message)
                : channel === 'pushplus' ? pushplusPayload(message, credential) : channel === 'wecom' ? wecomPayload(message)
                : channel === 'feishu' ? feishuPayload(message) : channel === 'dingtalk' ? dingtalkPayload(message) : customPayload(message);
            const form = channel === 'serverchan' ? new URLSearchParams(serverchanPayload(message)).toString() : undefined;
            const options: RequestInit & { dispatcher: Agent } = {
                method: 'POST', headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ?? JSON.stringify(body),
                redirect: 'error', signal, dispatcher: agent,
            };
            const response = await fetch(url, options);
            if (!response.ok) return 'failed';
            if (channel === 'custom') { await response.body?.cancel(); return 'accepted'; }
            const result: unknown = await response.json();
            if (!result || typeof result !== 'object') return 'failed';
            const value = result as Record<string, unknown>;
            const code = channel === 'wecom' || channel === 'dingtalk' ? value.errcode : value.code ?? value.StatusCode;
            return code === (channel === 'bark' || channel === 'pushplus' ? 200 : 0) ? 'accepted' : 'failed';
        } catch { return 'failed'; }
        finally { if (agent) await agent.destroy(); }
    } };
}
