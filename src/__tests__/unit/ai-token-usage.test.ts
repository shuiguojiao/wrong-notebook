import { describe, expect, it } from 'vitest';
import { extractTokenUsage } from '@/lib/ai/token-usage';

describe('提取提供商 token', () => {
    it.each([
        [{ usage: { prompt_tokens: 10, completion_tokens: 9, completion_tokens_details: { reasoning_tokens: 5 } } }, 10, 9],
        [{ usage: { input_tokens: 8, output_tokens: 6 } }, 8, 6],
        [{ usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 4, thoughtsTokenCount: 3 } }, 7, 7],
        [{ usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 0 } }, 7, 0],
        [{ usage: { prompt_tokens: 3 } }, 3, null],
        [{ usageMetadata: {} }, null, null],
        [{ usageMetadata: { thoughtsTokenCount: 8 } }, null, 8],
        [{ usage: { prompt_tokens: -1, completion_tokens: '3' } }, null, null],
        [{}, null, null], [null, null, null],
    ])('兼容响应 %j', (response, inputTokens, outputTokens) => {
        expect(extractTokenUsage(response)).toEqual({ inputTokens, outputTokens });
    });
});
