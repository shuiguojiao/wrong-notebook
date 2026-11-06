import "server-only";

import { withAgentUser } from "@/lib/api-handler";
import { createErrorResponse, tooManyRequests, validationError } from "@/lib/api-errors";
import { RateLimiter } from "@/lib/rate-limit";
import { agentPublicOrigin } from "@/lib/agent/client-config";
import { AgentInputError, runAgentOperation } from "@/lib/agent/service";
import type { AgentOperation } from "@/lib/agent/service";
import type { User } from "@prisma/client";

const requests = new RateLimiter({ limit: 60, windowMs: 60_000 });
const bodyReads = new Map<string, number>();

/** 鉴权后先按用户计数，再读取请求体；REST 与 MCP 共用读取并发额度。 */
export async function readAgentRequestInput(req: Request, userId: string): Promise<unknown> {
    const retry = requests.retryAfter(userId);
    if (retry) throw new AgentInputError("AGENT_RATE_LIMITED", 429, retry);
    requests.hit(userId);
    if (req.method === "GET") return Object.fromEntries(new URL(req.url).searchParams);
    const active = bodyReads.get(userId) ?? 0;
    if (active >= 2) throw new AgentInputError("AGENT_RATE_LIMITED", 429, 1_000);
    bodyReads.set(userId, active + 1);
    try { return await readAgentJson(req); }
    finally {
        const remaining = (bodyReads.get(userId) ?? 1) - 1;
        if (remaining) bodyReads.set(userId, remaining);
        else bodyReads.delete(userId);
    }
}

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

/** 下载与领域操作共用令牌鉴权、请求额度及错误响应。 */
export function agentResponseRoute(handler: (req: Request, user: User, input: unknown) => Promise<Response>) {
    return withAgentUser(async (req, { user }) => {
        try {
            const input = await readAgentRequestInput(req, user.id);
            return await handler(req, user, input);
        } catch (error) {
            if (!(error instanceof AgentInputError)) throw error;
            if (error.status === 429) return tooManyRequests(error.retryAfterMs, error.message);
            return error.status === 400 ? validationError(error.message) : createErrorResponse(error.message, error.status);
        }
    });
}

export function agentOperationRoute(operation: AgentOperation) {
    return agentResponseRoute(async (req, user, input) => {
        const result = await runAgentOperation(user, operation, input, agentPublicOrigin(req.url));
        return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    });
}
