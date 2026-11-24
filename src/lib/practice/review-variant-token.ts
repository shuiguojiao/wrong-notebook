import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { parseLastPractice, serializeLastPractice } from '@/lib/last-practice';
import type { LastPractice } from '@/lib/last-practice';

export const MAX_VARIANT_TOKEN_LENGTH = 500_000;

const state = globalThis as typeof globalThis & { reviewVariantKey?: Buffer };
const key = process.env.NEXTAUTH_SECRET || (state.reviewVariantKey ??= randomBytes(32));

function sign(payload: string, userId: string, itemId: string) {
    return createHmac('sha256', key).update(JSON.stringify(['review-variant', userId, itemId, payload])).digest();
}

/** 绑定本次生成的题目和原题归属，其他标签页的生成不会影响其判题或保存。 */
export function createReviewVariantToken(practice: LastPractice, userId: string, itemId: string): string {
    const payload = Buffer.from(serializeLastPractice(practice)).toString('base64url');
    return `${payload}.${sign(payload, userId, itemId).toString('hex')}`;
}

export function readReviewVariantToken(token: string, userId: string, itemId: string): LastPractice | null {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined || !/^[a-f0-9]{64}$/.test(signature)) return null;
    if (!timingSafeEqual(sign(payload, userId, itemId), Buffer.from(signature, 'hex'))) return null;
    return parseLastPractice(Buffer.from(payload, 'base64url').toString());
}
