export interface IntegrityBackfillOptions { user?: string; sourcePrefix?: string; limit: number; intervalMs: number; rulesOnly: boolean }

/** 先校验参数再加载数据库；必须显式选择 AI，默认只执行无费用的规则。 */
export function parseIntegrityBackfillOptions(args: string[]): IntegrityBackfillOptions {
    const result: IntegrityBackfillOptions = { limit: 100, intervalMs: 1000, rulesOnly: true };
    const seen = new Set<string>();
    for (let index = 0; index < args.length; index++) {
        const flag = args[index];
        if (seen.has(flag)) throw new Error(`参数重复：${flag}`);
        seen.add(flag);
        if (flag === "--ai" || flag === "--rules-only") { result.rulesOnly = flag === "--rules-only"; continue; }
        if (!["--user", "--source-prefix", "--limit", "--interval-ms"].includes(flag)) throw new Error(`未知参数：${flag}`);
        const value = args[++index];
        if (!value || value.startsWith("--")) throw new Error(`参数缺少值：${flag}`);
        if (flag === "--user") result.user = value;
        if (flag === "--source-prefix") result.sourcePrefix = value;
        if (flag === "--limit" || flag === "--interval-ms") {
            if (!/^\d+$/.test(value)) throw new Error(`参数须为整数：${flag}`);
            const number = Number(value);
            const min = flag === "--limit" ? 1 : 100;
            const max = flag === "--limit" ? 10000 : 60000;
            if (number < min || number > max) throw new Error(`参数超出范围：${flag} (${min}–${max})`);
            if (flag === "--limit") result.limit = number; else result.intervalMs = number;
        }
    }
    if (seen.has("--ai") && seen.has("--rules-only")) throw new Error("--ai 与 --rules-only 不能同时使用");
    return result;
}

/** 串行处理，间隔从上一题执行完成时开始计算。 */
export async function runRateLimited<T>(rows: readonly T[], intervalMs: number, operation: (row: T) => Promise<void>,
    wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
    for (const [index, row] of rows.entries()) {
        if (index) await wait(intervalMs);
        await operation(row);
    }
}
