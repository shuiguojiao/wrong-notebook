import 'server-only';

import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import type { CredentialReminderChannel, ReminderPolicy } from './schema';

const blocked = new BlockList();
for (const [base, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
    ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
    ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(base, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [base, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) blocked.addSubnet(base, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return !blocked.check(address, 'ipv4');
    // IPv4 映射、NAT64、回环、链路本地、ULA 等均不在可接受的全球单播范围
    return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

const hosts = { bark: 'api.day.app', serverchan: 'sctapi.ftqq.com', pushplus: 'www.pushplus.plus', wecom: 'qyapi.weixin.qq.com', feishu: 'open.feishu.cn', dingtalk: 'oapi.dingtalk.com' };

/** 同时支持 Node 的单地址与自动地址族选择回调，不再次查询 DNS。 */
export function pinnedLookup(target: LookupAddress): LookupFunction {
    return (_hostname, options, callback) => {
        if (options.all) callback(null, [target]);
        else callback(null, target.address, target.family);
    };
}
export function reminderAddress(channel: CredentialReminderChannel, credential: string, policy: ReminderPolicy): URL {
    let raw = credential;
    if (['serverchan', 'pushplus'].includes(channel) || (channel === 'bark' && !credential.includes('://'))) {
        if (!/^[A-Za-z0-9_-]+$/.test(credential)) throw new Error('INVALID_CREDENTIAL');
        raw = channel === 'serverchan' ? `https://sctapi.ftqq.com/${credential}.send` : channel === 'bark' ? `https://api.day.app/${credential}` : 'https://www.pushplus.plus/send';
    }
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('INVALID_ADDRESS');
    if (channel === 'custom') {
        if (policy.allowCustomReminders !== true) throw new Error('CUSTOM_DISABLED');
    } else {
        if (url.hostname !== hosts[channel] || url.port) throw new Error('INVALID_HOST');
        const valid = channel === 'bark' ? /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) && !url.search
            : channel === 'wecom' ? url.pathname === '/cgi-bin/webhook/send' && !!url.searchParams.get('key')
            : channel === 'feishu' ? /^\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9_-]+$/.test(url.pathname) && !url.search
            : channel === 'dingtalk' ? url.pathname === '/robot/send' && !!url.searchParams.get('access_token')
            : true;
        if (!valid) throw new Error('INVALID_ADDRESS');
    }
    return url;
}

/** 每次发送重新检查所有 DNS 结果；连接时固定到已检查地址以防 DNS 重绑定。 */
export async function resolveReminderAddress(url: URL, allowPrivate: boolean, signal: AbortSignal) {
    signal.throwIfAborted();
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const answers = await Promise.race([
        lookup(hostname, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('TIMEOUT')), { once: true })),
    ]);
    if (!answers.length || (!allowPrivate && answers.some(({ address }) => !isPublicAddress(address)))) throw new Error('PRIVATE_ADDRESS');
    return answers[0];
}
