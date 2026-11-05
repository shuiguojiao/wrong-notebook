import { describe, expect, it } from 'vitest';
import { estimateTokenCost, summarizeAiUsage } from '@/lib/ai-usage-stats';
import { getMonthRange } from '@/lib/date-time';

const price = { provider: 'openai', model: 'actual', inputPerMillion: 2, outputPerMillion: 8, currency: 'USD' };
describe('费用估算与统计', () => {
    it('按百万 token 计价，未知用量与未配置模型不推算', () => {
        const usage = { provider: 'openai', model: 'actual', inputTokens: 1_000_000, outputTokens: 250_000 };
        expect(estimateTokenCost(usage, [price])).toEqual({ currency: 'USD', amount: 4 });
        expect(estimateTokenCost(usage, [])).toBeNull();
        expect(estimateTokenCost({ ...usage, inputTokens: null }, [price])).toBeNull();
        expect(estimateTokenCost({ ...usage, model: 'alias' }, [price])).toBeNull();
    });
    it('同一操作的多模型明细分别估价；币种不混加，未知不显示为免费', () => {
        const details = [
            { provider: 'openai', model: 'actual', inputTokens: 1_000_000, outputTokens: 0 },
            { provider: 'gemini', model: 'flash', inputTokens: 500_000, outputTokens: 0 },
            { provider: 'openai', model: 'actual', inputTokens: null, outputTokens: null },
        ];
        const row = { kind: 'exam', provider: null, model: null, inputTokens: 1_500_000, outputTokens: 0, tokenBreakdown: JSON.stringify(details) };
        const summary = summarizeAiUsage([row, { ...row, kind: 'analyze', inputTokens: null, outputTokens: null, tokenBreakdown: null }], [price, { ...price, provider: 'gemini', model: 'flash', inputPerMillion: 6, currency: 'CNY' }]);
        expect(summary).toMatchObject({ calls: 2, kinds: { exam: 1, analyze: 1 }, inputTokens: 1_500_000, outputTokens: 0, unknownActions: 2, incompleteCosts: 2, costs: { USD: 2, CNY: 3 } });
    });
});
describe('应用时区的自然月', () => {
    it('北京时间月初尚在 UTC 上月', () => {
        expect(getMonthRange(new Date('2026-10-31T16:00:00Z'), 'Asia/Shanghai')).toEqual({ start: new Date('2026-10-31T16:00:00Z'), end: new Date('2026-11-30T16:00:00Z') });
    });
    it('跨年上月及夏令时变化', () => {
        expect(getMonthRange(new Date('2026-01-01T00:00:00Z'), 'Asia/Shanghai', -1)).toEqual({ start: new Date('2025-11-30T16:00:00Z'), end: new Date('2025-12-31T16:00:00Z') });
        expect(getMonthRange(new Date('2026-03-15T12:00:00Z'), 'America/New_York')).toEqual({ start: new Date('2026-03-01T05:00:00Z'), end: new Date('2026-04-01T04:00:00Z') });
    });
});
