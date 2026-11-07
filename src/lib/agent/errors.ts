import "server-only";

export class AgentInputError extends Error {
    constructor(message: string, readonly status = 400, readonly retryAfterMs = 0) { super(message); }
}

export function validateAgentInput<T>(parsed: { success: true; data: T } | { success: false }): T {
    if (!parsed.success) throw new AgentInputError("AGENT_INVALID_INPUT");
    return parsed.data;
}
