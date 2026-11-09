import "server-only";

export class AgentInputError extends Error {
    constructor(message: string, readonly status = 400, readonly retryAfterMs = 0) { super(message); }
}

export function validateAgentInput<T>(parsed: { success: true; data: T } | { success: false }): T {
    if (!parsed.success) throw new AgentInputError("AGENT_INVALID_INPUT");
    return parsed.data;
}

/** 出处页输入错误；REST 与 MCP 共用这些公开错误码。 */
export const AGENT_SOURCE_ERROR_CODES = [
    "AGENT_SOURCE_INVALID", "AGENT_SOURCE_PAGE_NOT_FOUND", "AGENT_SOURCE_FORMAT_UNSUPPORTED",
    "AGENT_SOURCE_TOO_LARGE", "AGENT_SOURCE_DIMENSIONS_EXCEEDED", "AGENT_SOURCE_CROP_TOO_LARGE",
] as const;
