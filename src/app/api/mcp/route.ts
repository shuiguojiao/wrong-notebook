import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { withAgentUser } from "@/lib/api-handler";
import { createErrorResponse, tooManyRequests } from "@/lib/api-errors";
import { agentPublicOrigin } from "@/lib/agent/client-config";
import { readAgentRequestInput } from "@/lib/agent/http";
import { createAgentMcpServer } from "@/lib/agent/mcp-server";
import { AgentInputError } from "@/lib/agent/service";

export const runtime = "nodejs";

/** 无状态 Streamable HTTP：每次请求独立鉴权、创建并关闭服务器与 transport。 */
export const POST = withAgentUser(async (req, { user }) => {
    let parsedBody: unknown;
    try { parsedBody = await readAgentRequestInput(req, user.id); }
    catch (error) {
        if (error instanceof AgentInputError) {
            if (error.status === 429) return tooManyRequests(error.retryAfterMs, error.message);
            return createErrorResponse(error.message, error.status);
        }
        throw error;
    }
    const server = await createAgentMcpServer(user, agentPublicOrigin(req.url));
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
        await server.connect(transport);
        const response = await transport.handleRequest(req, { parsedBody });
        response.headers.set("Cache-Control", "no-store");
        return response;
    } finally { await server.close(); }
});

function methodNotAllowed() {
    const response = createErrorResponse("Method not allowed", 405);
    response.headers.set("Allow", "POST");
    return response;
}
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
