import "server-only";

import { withAgentUser } from "@/lib/api-handler";
import { createErrorResponse, tooManyRequests, validationError } from "@/lib/api-errors";
import { AgentInputError, runAgentOperation } from "@/lib/agent/service";
import type { AgentOperation } from "@/lib/agent/service";

/** 有限读取请求体，避免未声明长度或伪造 Content-Length 绕过图片总量上限。 */
export async function readAgentJson(req: Request): Promise<unknown> {
    const maxBytes = 145 * 1024 * 1024;
    if (Number(req.headers.get("content-length")) > maxBytes) throw new AgentInputError("AGENT_REQUEST_TOO_LARGE", 413);
    const reader = req.body?.getReader();
    if (!reader) throw new AgentInputError("AGENT_INVALID_INPUT");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) throw new AgentInputError("AGENT_REQUEST_TOO_LARGE", 413);
            chunks.push(value);
        }
        try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { throw new AgentInputError("AGENT_INVALID_INPUT"); }
    } finally { await reader.cancel().catch(() => undefined); }
}

export function agentOperationRoute(operation: AgentOperation) {
    return withAgentUser(async (req, { user }) => {
        try {
            const url = new URL(req.url);
            const input = req.method === "GET" ? Object.fromEntries(url.searchParams) : await readAgentJson(req);
            const result = await runAgentOperation(user, operation, input, url.origin);
            return Response.json(result, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            if (!(error instanceof AgentInputError)) throw error;
            if (error.status === 429) return tooManyRequests(error.retryAfterMs, error.message);
            return error.status === 400 ? validationError(error.message) : createErrorResponse(error.message, error.status);
        }
    });
}
