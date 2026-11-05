import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { runSerializedTransaction, serializeWrite } from "@/lib/db-write-queue";

export const AGENT_TOKEN_LIMIT = 20;
export const agentTokenSelect = {
    id: true, name: true, tokenPrefix: true, lastUsedAt: true,
    expiresAt: true, revokedAt: true, createdAt: true,
} as const;

export function hashAgentToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/** 明文只通过本次创建结果返回，数据库与后续列表只含摘要和前缀。 */
export async function createAgentToken(userId: string, name: string, expiresAt?: Date) {
    return runSerializedTransaction(async (tx) => {
        const count = await tx.agentToken.count({ where: { userId, revokedAt: null } });
        if (count >= AGENT_TOKEN_LIMIT) return null;
        const token = `wnb_${randomBytes(32).toString("base64url")}`;
        const record = await tx.agentToken.create({
            data: { userId, name, tokenHash: hashAgentToken(token), tokenPrefix: token.slice(0, 8), expiresAt },
            select: agentTokenSelect,
        });
        return { ...record, token };
    });
}

/** 撤销、到期和停用账户均立即失效；使用时间通过条件更新每分钟最多写一次。 */
export async function validateAgentToken(token: string) {
    if (!/^wnb_[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const record = await prisma.agentToken.findUnique({
        where: { tokenHash: hashAgentToken(token) }, include: { user: true },
    });
    const now = new Date();
    if (!record || record.revokedAt || (record.expiresAt && record.expiresAt <= now) || !record.user.isActive) return null;
    const cutoff = new Date(now.getTime() - 60_000);
    if (!record.lastUsedAt || record.lastUsedAt <= cutoff) {
        await serializeWrite(() => prisma.agentToken.updateMany({
            where: { id: record.id, revokedAt: null, OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: cutoff } }] },
            data: { lastUsedAt: now },
        }));
    }
    return record.user;
}
