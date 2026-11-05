import type { ModelTokenUsage } from '@/lib/ai/token-usage';

export interface ModelPrice {
    provider: string;
    model: string;
    inputPerMillion: number;
    outputPerMillion: number;
    currency: string;
}

export interface UsageRow {
    kind: string;
    provider: string | null;
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    tokenBreakdown: string | null;
}

export interface UsageStats {
    calls: number;
    kinds: Record<string, number>;
    inputTokens: number;
    outputTokens: number;
    unknownActions: number;
    costs: Record<string, number>;
    incompleteCosts: number;
    models: { provider: string; model: string }[];
}

/** 单价由管理员维护；币种分别合计，不做汇率换算。缺失单价或 token 不推算。 */
export function estimateTokenCost(usage: ModelTokenUsage, prices: ModelPrice[]): { currency: string; amount: number } | null {
    const price = prices.find(item => item.provider === usage.provider && item.model === usage.model);
    if (!price || usage.inputTokens === null || usage.outputTokens === null) return null;
    return { currency: price.currency, amount: (usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion) / 1_000_000 };
}

export function summarizeAiUsage(rows: UsageRow[], prices: ModelPrice[] = []): UsageStats {
    const stats: UsageStats = { calls: rows.length, kinds: {}, inputTokens: 0, outputTokens: 0, unknownActions: 0, costs: {}, incompleteCosts: 0, models: [] };
    const models = new Map<string, { provider: string; model: string }>();
    for (const row of rows) {
        stats.kinds[row.kind] = (stats.kinds[row.kind] ?? 0) + 1;
        stats.inputTokens += row.inputTokens ?? 0;
        stats.outputTokens += row.outputTokens ?? 0;
        const details: ModelTokenUsage[] = row.tokenBreakdown ? JSON.parse(row.tokenBreakdown) : [{ provider: row.provider ?? '', model: row.model ?? '', inputTokens: row.inputTokens, outputTokens: row.outputTokens }];
        if (details.some(item => item.inputTokens === null || item.outputTokens === null)) stats.unknownActions += 1;
        for (const item of details) {
            if (item.provider && item.model) models.set(JSON.stringify([item.provider, item.model]), { provider: item.provider, model: item.model });
            const cost = estimateTokenCost(item, prices);
            if (cost) stats.costs[cost.currency] = (stats.costs[cost.currency] ?? 0) + cost.amount;
            else stats.incompleteCosts += 1;
        }
    }
    stats.models = [...models.values()];
    return stats;
}

export interface AdminAiUsageData {
    timeZone: string;
    months: {
        month: string;
        start: string;
        end: string;
        total: UsageStats;
        users: { id: string; name: string | null; email: string; stats: UsageStats }[];
    }[];
}
