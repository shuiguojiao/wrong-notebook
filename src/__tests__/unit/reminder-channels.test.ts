// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
const fetcher = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => dns);
vi.mock('undici', async (importOriginal) => ({ ...await importOriginal<typeof import('undici')>(), fetch: fetcher }));
import { createReminderChannel } from '@/lib/reminders/channel';
import { isPublicAddress, pinnedLookup, reminderAddress, resolveReminderAddress } from '@/lib/reminders/address';
import { maskCredential } from '@/lib/reminders/schema';
import type { CredentialReminderChannel } from '@/lib/reminders/schema';
const message = { title: '复习提醒', body: '数学 5', url: 'https://notebook.example/review' };
const credentials: Record<CredentialReminderChannel, string> = {
    bark: 'test-device-key', serverchan: 'SCT_test', pushplus: 'test-token',
    wecom: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test',
    feishu: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
    dingtalk: 'https://oapi.dingtalk.com/robot/send?access_token=test', custom: 'https://hook.example/send',
};
beforeEach(() => { fetcher.mockReset(); dns.lookup.mockClear().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]); });
describe('提醒渠道与地址安全', () => {
    it('连接固定到已检查地址，支持单地址与自动地址族模式', () => {
        const target = { address: '8.8.8.8', family: 4 };
        const callback = vi.fn();
        pinnedLookup(target)('rebind.example', {}, callback);
        expect(callback).toHaveBeenLastCalledWith(null, '8.8.8.8', 4);
        pinnedLookup(target)('rebind.example', { all: true }, callback);
        expect(callback).toHaveBeenLastCalledWith(null, [target]);
        expect(dns.lookup).not.toHaveBeenCalled();
    });
    it.each(['serverchan', 'pushplus', 'wecom', 'feishu', 'dingtalk'] as const)('%s 拒绝非官方主机与非 HTTPS', (channel) => {
        expect(() => reminderAddress(channel, 'https://evil.example/send', {})).toThrow();
        expect(() => reminderAddress(channel, 'http://example.com/send', {})).toThrow();
    });
    it.each(Object.keys(credentials) as CredentialReminderChannel[])('%s 的请求格式与成功响应', async (channel) => {
        const response = channel === 'custom' ? new Response('ok') : Response.json(channel === 'wecom' || channel === 'dingtalk' ? { errcode: 0 } : { code: channel === 'pushplus' || channel === 'bark' ? 200 : 0 });
        fetcher.mockResolvedValue(response);
        expect(await createReminderChannel(channel, credentials[channel], { allowCustomReminders: true }).send(message)).toBe('accepted');
        const [url, options] = fetcher.mock.calls[0];
        expect(url.href).toBe(reminderAddress(channel, credentials[channel], { allowCustomReminders: true }).href);
        expect(options).toMatchObject({ method: 'POST', redirect: 'error', headers: { 'Content-Type': channel === 'serverchan' ? 'application/x-www-form-urlencoded' : 'application/json' }, signal: expect.any(AbortSignal) });
        const body = channel === 'serverchan' ? Object.fromEntries(new URLSearchParams(options.body)) : JSON.parse(options.body);
        const expected = channel === 'bark' || channel === 'custom' ? message : channel === 'serverchan' ? { title: message.title, desp: `${message.body}\n\n${message.url}` }
            : channel === 'pushplus' ? { token: credentials.pushplus, title: message.title, content: `${message.body}\n${message.url}`, template: 'txt' }
            : channel === 'feishu' ? { msg_type: 'text', content: { text: `${message.title}\n${message.body}\n${message.url}` } }
            : { msgtype: 'text', text: { content: `${message.title}\n${message.body}\n${message.url}` } };
        expect(body).toEqual(expected);
        // 请求确实使用独立连接器，不经过系统代理；DNS 只校验一次
        expect(options.dispatcher).toBeDefined(); expect(dns.lookup).toHaveBeenCalledTimes(1);
    });
    it('Bark 接受完整官方地址；自定义地址由管理员单独开启', () => {
        expect(reminderAddress('bark', 'https://api.day.app/device-key', {}).hostname).toBe('api.day.app');
        expect(() => reminderAddress('custom', credentials.custom, {})).toThrow();
    });
    it.each(['http://api.day.app/key', 'https://api.day.app.evil.example/key', 'https://user@api.day.app/key', 'https://api.day.app:8443/key', 'https://127.0.0.1/key', 'https://api.day.app/key/extra', 'https://api.day.app/key#secret'])('拒绝 Bark 非法地址 %s', (url) => {
        expect(() => reminderAddress('bark', url, {})).toThrow();
    });
    it.each(['127.0.0.1', '10.0.0.1', '172.16.1.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', '::', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '2002:7f00:1::', '64:ff9b::7f00:1'])('拒绝非公网 IP %s', (address) => expect(isPublicAddress(address)).toBe(false));
    it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('接受公网 IP %s', (address) => expect(isPublicAddress(address)).toBe(true));
    it('所有 DNS 地址均须通过检查；显式允许内网后才能使用', async () => {
        dns.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '::1', family: 6 }]);
        await expect(resolveReminderAddress(new URL(credentials.custom), false, AbortSignal.timeout(1000))).rejects.toThrow('PRIVATE_ADDRESS');
        await expect(resolveReminderAddress(new URL(credentials.custom), true, AbortSignal.timeout(1000))).resolves.toMatchObject({ address: '8.8.8.8' });
    });
    it('官方渠道也拒绝 DNS 内网结果，即使管理员允许自定义内网', async () => {
        dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
        expect(await createReminderChannel('bark', credentials.bark, { allowPrivateReminders: true }).send(message)).toBe('failed');
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('超时、HTTP 错误、重定向和业务错误均不算服务接受', async () => {
        for (const response of [new Response('', { status: 302 }), new Response('', { status: 500 }), Response.json({ code: 400 }), new Response('invalid json')]) {
            fetcher.mockResolvedValueOnce(response);
            expect(await createReminderChannel('bark', credentials.bark, {}).send(message)).toBe('failed');
        }
        fetcher.mockRejectedValue(new Error('sensitive-credential'));
        expect(await createReminderChannel('bark', credentials.bark, {}).send(message)).toBe('failed');
    });
    it('只显示末四位，短凭据全部隐藏', () => {
        expect(maskCredential('abcdef1234')).toBe('••••1234'); expect(maskCredential('1234')).toBe('••••'); expect(maskCredential(null)).toBeNull();
    });
});
