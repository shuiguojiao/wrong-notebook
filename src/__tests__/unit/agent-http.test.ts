// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn(async () => ({})) }));
vi.mock("@/lib/api-handler", () => ({
    withAgentUser: (handler: (req: Request, context: { user: { id: string } }) => Promise<Response>) =>
        (req: Request) => handler(req, { user: { id: req.headers.get("x-test-user")! } }),
}));
vi.mock("@/lib/agent/service", () => ({
    AgentInputError: class extends Error {
        constructor(message: string, readonly status = 400, readonly retryAfterMs = 0) { super(message); }
    },
    runAgentOperation: mocks.run,
}));
vi.mock("@/lib/agent/mcp-server", () => ({
    createAgentMcpServer: () => ({ connect: vi.fn(), close: vi.fn() }),
}));
vi.mock("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", () => ({
    WebStandardStreamableHTTPServerTransport: class {
        async handleRequest() { return Response.json({}); }
    },
}));
import { agentOperationRoute } from "@/lib/agent/http";
import { POST as mcp } from "@/app/api/mcp/route";

const rest = agentOperationRoute("find_duplicates");
let sequence = 0;
function request(userId: string, body: BodyInit = "{}", method = "POST") {
    const init: RequestInit & { duplex: string } = { method, headers: { "x-test-user": userId }, duplex: "half" };
    if (method !== "GET") init.body = body;
    return new Request("https://notebook.example/api/test?q=test", init);
}
function unreadableBody() {
    const pull = vi.fn(() => { throw new Error("不应读取已被限流的请求体"); });
    return { pull, body: new ReadableStream<Uint8Array>({ pull }, { highWaterMark: 0 }) };
}
function heldBody() {
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const pull = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; }, pull }, { highWaterMark: 0 });
    return { body, pull, finish: () => { controller.enqueue(new TextEncoder().encode("{}")); controller.close(); } };
}

describe.each([["REST", rest, mcp], ["MCP", mcp, rest]] as const)("%s 请求体入口限流", (_name, route, otherRoute) => {
    it("前 60 次请求正常，第 61 次在读取流之前返回带重试时间的 429", async () => {
        const userId = `rate-${++sequence}`;
        for (let index = 0; index < 60; index++) {
            expect((await route(request(userId))).status).toBe(200);
        }
        const { body, pull } = unreadableBody();
        const response = await otherRoute(request(userId, body));
        expect(response.status).toBe(429);
        expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
        expect(pull).not.toHaveBeenCalled();
    });
    it("跨 REST/MCP 共用两个读取额度，其他用户和 GET 不受影响，完成后释放", async () => {
        const userId = `concurrent-${++sequence}`;
        const first = heldBody();
        const second = heldBody();
        const pending = [route(request(userId, first.body)), otherRoute(request(userId, second.body))];
        await vi.waitFor(() => {
            expect(first.pull).toHaveBeenCalled();
            expect(second.pull).toHaveBeenCalled();
        });
        const { body, pull } = unreadableBody();
        const response = await route(request(userId, body));
        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("1");
        expect(pull).not.toHaveBeenCalled();
        expect((await route(request(`${userId}-other`))).status).toBe(200);
        expect((await rest(request(userId, "", "GET"))).status).toBe(200);
        first.finish();
        second.finish();
        expect((await Promise.all(pending)).map((result) => result.status)).toEqual([200, 200]);
        expect((await route(request(userId))).status).toBe(200);
    });
    it("JSON 解析失败和流读取失败后释放读取额度", async () => {
        const userId = `failure-${++sequence}`;
        for (let index = 0; index < 3; index++) {
            expect((await route(request(userId, "{"))).status).toBe(400);
            const { body } = unreadableBody();
            await expect(route(request(userId, body))).rejects.toThrow("不应读取");
        }
        expect((await route(request(userId))).status).toBe(200);
    });
});
