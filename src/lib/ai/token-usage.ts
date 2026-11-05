export interface TokenUsage {
    inputTokens: number | null;
    outputTokens: number | null;
}

function object(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function tokens(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** OpenAI/Anthropic 的输出已含思考；Gemini 的思考需另外相加，避免重复计算。 */
export function extractTokenUsage(response: unknown): TokenUsage {
    const data = object(response);
    if (data.usageMetadata) {
        const usage = object(data.usageMetadata);
        const output = tokens(usage.candidatesTokenCount);
        const thoughts = tokens(usage.thoughtsTokenCount);
        return { inputTokens: tokens(usage.promptTokenCount), outputTokens: output === null && thoughts === null ? null : (output ?? 0) + (thoughts ?? 0) };
    }
    const usage = object(data.usage);
    return {
        inputTokens: tokens(usage.prompt_tokens ?? usage.input_tokens),
        outputTokens: tokens(usage.completion_tokens ?? usage.output_tokens),
    };
}

export interface ModelTokenUsage extends TokenUsage {
    provider: string;
    model: string;
}
