import "server-only";

import { rewardMeta } from '@/lib/rewards/rules';
import type { ImportContext } from './types';

/** 保留孤立账目，对已恢复实体重映射幂等引用与元数据。 */
export async function importRewardEntries(ctx: ImportContext): Promise<void> {
    for (const entry of ctx.normalized.data.rewardEntries ?? []) {
        if (await ctx.tx.rewardEntry.findUnique({ where: { id: entry.id } })) continue;
        const userId = ctx.importAll ? entry.userId : ctx.user.id;
        if (!ctx.importAll && entry.userId !== ctx.normalized.data.user.id) continue;
        let refKey = entry.refKey;
        if (refKey.startsWith('record:')) refKey = `record:${ctx.practiceRecordIdMap.get(refKey.slice(7)) ?? refKey.slice(7)}`;
        if (refKey.startsWith('item:')) refKey = `item:${ctx.errorItemIdMap.get(refKey.slice(5)) ?? refKey.slice(5)}`;
        if (refKey.startsWith('sticker:')) {
            try {
                const key: unknown = JSON.parse(refKey.slice(8));
                if (Array.isArray(key) && typeof key[0] === 'string') {
                    key[0] = ctx.subjectIdMap.get(key[0]) ?? key[0];
                    refKey = `sticker:${JSON.stringify(key)}`;
                }
            } catch { /* 旧版或扩展贴纸键保持原值。 */ }
        }
        const meta = entry.meta ? rewardMeta(entry.meta) : null;
        if (meta?.errorItemId) meta.errorItemId = ctx.errorItemIdMap.get(meta.errorItemId) ?? meta.errorItemId;
        if (meta?.examAttemptId) meta.examAttemptId = ctx.examAttemptIdMap.get(meta.examAttemptId) ?? meta.examAttemptId;
        if (meta?.examQuestionId) meta.examQuestionId = ctx.examQuestionIdMap.get(meta.examQuestionId) ?? meta.examQuestionId;
        await ctx.tx.rewardEntry.upsert({
            where: { userId_type_refKey: { userId, type: entry.type, refKey } }, update: {},
            create: { ...entry, userId, refKey, meta: meta ? JSON.stringify(meta) : null, createdAt: new Date(entry.createdAt) },
        });
    }
}
