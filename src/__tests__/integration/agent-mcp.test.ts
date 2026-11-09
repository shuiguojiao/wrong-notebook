// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PNG } from "pngjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createAgentTestDatabase } from "@/__tests__/helpers/agent-database";

const state = vi.hoisted(() => ({ client: undefined as unknown as PrismaClient, ai: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, {
    get(_target, key) {
        const value = Reflect.get(state.client, key);
        return typeof value === "function" ? value.bind(state.client) : value;
    },
}) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => null) }));
vi.mock("@/lib/ai", () => ({ getAIService: state.ai }));
import { GET as notebooks } from "@/app/api/agent/notebooks/route";
import { GET as downloadSkill } from "@/app/api/agent/skill/route";
import { POST, GET, DELETE } from "@/app/api/mcp/route";
import { createAgentToken } from "@/lib/agent-token";

let database: ReturnType<typeof createAgentTestDatabase>;
let token: string;
let otherToken: string;
let notebookId: string;
const clients: Client[] = [];
function rpc(method: string, params: unknown = {}, bearer = token) {
    return POST(new Request("https://notebook.example/api/mcp", {
        method: "POST", headers: {
            Authorization: `Bearer ${bearer}`, "Content-Type": "application/json",
            Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }));
}
async function connect(bearer = token) {
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    clients.push(client);
    const transport = new StreamableHTTPClientTransport(new URL("https://notebook.example/api/mcp"), {
        requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
        fetch: async (input, init) => {
            const request = new Request(input, init);
            if (request.method === "GET") return GET();
            if (request.method === "DELETE") return DELETE();
            return POST(request);
        },
    });
    await client.connect(transport);
    return { client, transport };
}
beforeAll(async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://notebook.example");
    database = createAgentTestDatabase();
    state.client = database.client;
    const user = await state.client.user.create({ data: { email: "mcp-a@example.com", password: "test-only", gradeRecognitionMode: "ai" } });
    const other = await state.client.user.create({ data: { email: "mcp-b@example.com", password: "test-only" } });
    token = (await createAgentToken(user.id, "MCP"))!.token;
    otherToken = (await createAgentToken(other.id, "MCP"))!.token;
    notebookId = (await state.client.subject.create({ data: { userId: user.id, name: "数学", subjectKey: "math" } })).id;
});
afterAll(async () => {
    vi.unstubAllEnvs();
    for (const client of clients) await client.close();
    await database?.dispose();
});

describe("无状态 MCP（真实 SDK 与 SQLite）", () => {
    it("initialize 不返回会话编号，tools/list 暴露导入与纠错工具", async () => {
        const response = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
        expect(response.status).toBe(200);
        expect(response.headers.get("mcp-session-id")).toBeNull();
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        const initialized = (await response.json()).result;
        expect(initialized.serverInfo.name).toBe("wrong-notebook");
        expect(initialized.instructions).toContain("最新导入 Skill 版本：5");
        expect(initialized.instructions).toContain("https://notebook.example/api/agent/skill");
        expect(initialized.instructions).toContain("不自动更新");
        const tools = (await (await rpc("tools/list")).json()).result.tools;
        expect(tools.map((tool: { name: string }) => tool.name).sort()).toEqual(["create_error_items", "delete_error_item", "delete_error_record", "find_duplicates", "get_error_item", "list_notebooks", "search_error_items", "search_tags", "update_error_item", "update_error_record", "upload_source_page"]);
        const itemProperties = tools.find((tool: { name: string }) => tool.name === "create_error_items").inputSchema.properties.items.items.properties;
        expect(itemProperties).toHaveProperty("wrongAnswerText");
        expect(itemProperties).toHaveProperty("sourcePage");
        expect(tools.find((tool: { name: string }) => tool.name === "update_error_item").inputSchema.properties.patch.properties).toHaveProperty("sourcePage");
    });
    it("真实客户端完成握手、查询和 create_error_items，复用同一领域逻辑", async () => {
        const { client, transport } = await connect();
        expect(transport.sessionId).toBeUndefined();
        const listed = await client.callTool({ name: "list_notebooks", arguments: {} });
        expect(listed.structuredContent).toEqual({ notebooks: [expect.objectContaining({ id: notebookId })], skill: { version: 5, downloadUrl: "https://notebook.example/api/agent/skill" } });
        const result = await client.callTool({ name: "create_error_items", arguments: { items: [
            { notebookId, questionText: "MCP 求解方程 7x - 9 = 33", answerText: "x=6", wrongAnswerText: "x=5", knowledgePoints: ["MCP 方程标签"] },
            { notebookId: "not-owned", questionText: "另一道不能保存的题目" },
        ] } });
        const structured = result.structuredContent as { results: Array<{ id?: string; status?: string; error?: string; link?: string }> };
        expect(structured.results[0]).toEqual(expect.objectContaining({ id: expect.any(String), status: "created", link: expect.stringContaining("/error-items/") }));
        expect(structured.results[1].error).toBe("AGENT_NOTEBOOK_NOT_FOUND");
        const saved = await state.client.errorItem.findUniqueOrThrow({ where: { id: structured.results[0].id! }, include: { tags: true } });
        expect(saved.source).toBe("agent");
        expect(saved.tags.map((tag) => tag.name)).toEqual(["MCP 方程标签"]);
        expect(state.ai).not.toHaveBeenCalled();
        const found = await client.callTool({ name: "find_duplicates", arguments: { questionText: saved.questionText } });
        expect(found.structuredContent).toEqual({ duplicates: [expect.objectContaining({ id: saved.id, similarity: 1 })] });
        const tags = await client.callTool({ name: "search_tags", arguments: { subjectId: notebookId, q: "MCP" } });
        expect(tags.structuredContent).toEqual({ tags: [expect.objectContaining({ name: "MCP 方程标签" })] });
    });
    it("真实 MCP 客户端上传整页并用 pageId 裁图导入", async () => {
        const owner = await state.client.user.create({ data: { email: "mcp-source@example.com", password: "test-only" } });
        const bearer = (await createAgentToken(owner.id, "source"))!.token;
        const notebook = await state.client.subject.create({ data: { userId: owner.id, name: "出处测试" } });
        const { client } = await connect(bearer);
        const png = PNG.sync.write(new PNG({ width: 30, height: 40 }));
        const uploaded = await client.callTool({ name: "upload_source_page", arguments: { base64: png.toString("base64"), mimeType: "image/png", fileName: "mcp.png" } });
        expect(uploaded.isError).toBeFalsy();
        expect(uploaded.structuredContent).toMatchObject({ pageId: expect.any(String), width: 30, height: 40, reused: false });
        const pageId = (uploaded.structuredContent as { pageId: string }).pageId;
        const imported = await client.callTool({ name: "create_error_items", arguments: { items: [{ notebookId: notebook.id, questionText: "MCP 出处题目", source: "MCP 文字来源", sourcePage: { pageId, regions: [{ x: 0, y: 0, width: 1, height: 1 }] } }] } });
        expect(imported.structuredContent).toMatchObject({ results: [{ status: "created" }] });
        const id = (imported.structuredContent as { results: Array<{ id: string }> }).results[0].id;
        const detail = (await client.callTool({ name: "get_error_item", arguments: { id } })).structuredContent;
        expect(detail).toMatchObject({ item: { source: "MCP 文字来源", sourcePage: { pageId, fileName: "mcp.png" } } });
        expect(detail).not.toHaveProperty("item.sourceText");
        const updated = await client.callTool({ name: "update_error_item", arguments: { id, expectedRevision: (detail as { item: { revision: string } }).item.revision,
            patch: { source: "MCP 更新来源", sourcePage: { pageId, fileName: "忽略改名.png", pageNumber: 2, regions: [{ x: 0, y: 0, width: 1, height: 0.5 }] } } } });
        expect(updated.isError).toBeFalsy();
        expect(updated.structuredContent).toMatchObject({ item: { source: "MCP 更新来源", sourcePage: { pageId, fileName: "mcp.png", pageNumber: 2 } } });
    });
    it("新请求仍按自己的令牌隔离数据，无法访问其他用户错题本", async () => {
        const { client } = await connect(otherToken);
        expect((await client.callTool({ name: "list_notebooks", arguments: {} })).structuredContent).toEqual({ notebooks: [], skill: { version: 5, downloadUrl: "https://notebook.example/api/agent/skill" } });
        const result = await client.callTool({ name: "search_tags", arguments: { subjectId: notebookId } });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toEqual({ error: "AGENT_NOTEBOOK_NOT_FOUND", status: 404 });
    });
    it("真实 MCP 客户端完成查找、读回、更正、重复记录撤销与误收录删除", async () => {
        const { client } = await connect();
        const created = await client.callTool({ name: "create_error_items", arguments: { items: [
            { notebookId, questionText: "纠错闭环专用题：计算 123456 + 987654", source: "MCP纠错来源", answerText: "错误识别" },
        ] } });
        const id = (created.structuredContent as { results: Array<{ id: string }> }).results[0].id;
        const found = await client.callTool({ name: "search_error_items", arguments: { source: "MCP纠错来源" } });
        expect(found.structuredContent).toMatchObject({ total: 1, items: [{ id }] });
        const read = await client.callTool({ name: "get_error_item", arguments: { id } });
        const old = (read.structuredContent as { item: { revision: string } }).item;
        const changed = await client.callTool({ name: "update_error_item", arguments: { id, expectedRevision: old.revision, patch: { answerText: "1111110" } } });
        expect(changed.structuredContent).toMatchObject({ item: { answerText: "1111110", recordTotal: 0 } });
        const conflict = await client.callTool({ name: "update_error_item", arguments: { id, expectedRevision: old.revision, patch: { answerText: "不能覆盖" } } });
        expect(conflict).toMatchObject({ isError: true, structuredContent: { error: "AGENT_REVISION_CONFLICT", status: 409 } });
        const duplicate = await client.callTool({ name: "create_error_items", arguments: { items: [{ notebookId, questionText: "纠错闭环专用题：计算 123456 + 987654" }] } });
        const recordId = (duplicate.structuredContent as { results: Array<{ practiceRecordId: string }> }).results[0].practiceRecordId;
        expect(recordId).toEqual(expect.any(String));
        const latest = (await client.callTool({ name: "get_error_item", arguments: { id } })).structuredContent as { item: { revision: string } };
        const corrected = await client.callTool({ name: "update_error_record", arguments: { id, recordId, expectedRevision: latest.item.revision, patch: { notes: "用户确认是误录" } } });
        const correctedItem = (corrected.structuredContent as { item: { revision: string } }).item;
        const undone = await client.callTool({ name: "delete_error_record", arguments: { id, recordId, expectedRevision: correctedItem.revision, confirm: true } });
        expect(undone.structuredContent).toMatchObject({ item: { recordTotal: 0, answerText: "1111110" }, deleted: true });
        const item = (undone.structuredContent as { item: { revision: string } }).item;
        expect((await client.callTool({ name: "delete_error_item", arguments: { id, expectedRevision: item.revision, confirm: true } })).structuredContent).toMatchObject({ id, deleted: true });
        expect(await state.client.errorItem.findUnique({ where: { id } })).toBeNull();
        expect(state.ai).not.toHaveBeenCalled();
    });
    it("无令牌与撤销令牌返回 401，不接受会话代替代理令牌", async () => {
        expect((await rpc("tools/list", {}, "")).status).toBe(401);
        const user = await state.client.user.findUniqueOrThrow({ where: { email: "mcp-a@example.com" } });
        const revoked = (await createAgentToken(user.id, "revoked"))!;
        await state.client.agentToken.update({ where: { id: revoked.id }, data: { revokedAt: new Date() } });
        expect((await rpc("tools/list", {}, revoked.token)).status).toBe(401);
    });
    it("数据库异常只返回公开错误，不把 SQL 或服务端路径暴露给代理", async () => {
        const { client } = await connect();
        vi.spyOn(state.client.subject, "findMany").mockRejectedValueOnce(new Error("private-database-path-and-sql"));
        const result = await client.callTool({ name: "list_notebooks", arguments: {} });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toEqual({ error: "AGENT_OPERATION_FAILED", status: 500 });
        expect(JSON.stringify(result)).not.toContain("private-database-path-and-sql");
    });
    it("REST 和 MCP 工具请求共享 60 次额度，每次只计数一次", async () => {
        const user = await state.client.user.create({ data: { email: "mcp-limit@example.com", password: "test-only" } });
        const bearer = (await createAgentToken(user.id, "limit"))!.token;
        expect((await downloadSkill(new Request("https://notebook.example/api/agent/skill", { headers: { Authorization: `Bearer ${bearer}` } }))).status).toBe(200);
        for (let index = 0; index < 59; index++) {
            const response = index % 2 === 0
                ? await notebooks(new Request("https://notebook.example/api/agent/notebooks", { headers: { Authorization: `Bearer ${bearer}` } }))
                : await rpc("tools/call", { name: "list_notebooks", arguments: {} }, bearer);
            expect(response.status).toBe(200);
            const body = await response.json();
            expect(index % 2 === 0 ? body.notebooks : body.result.structuredContent.notebooks).toEqual([]);
        }
        const response = await rpc("tools/list", {}, bearer);
        expect(response.status).toBe(429);
        expect((await downloadSkill(new Request("https://notebook.example/api/agent/skill", { headers: { Authorization: `Bearer ${bearer}` } }))).status).toBe(429);
        expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    });
    it("GET/DELETE 为 405，非法 JSON 与工具参数不产生写入", async () => {
        expect(GET().status).toBe(405);
        expect(DELETE().status).toBe(405);
        expect(GET().headers.get("Allow")).toBe("POST");
        const invalid = await POST(new Request("https://notebook.example/api/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: "{" }));
        expect(invalid.status).toBe(400);
        const count = await state.client.errorItem.count();
        const response = await rpc("tools/call", { name: "create_error_items", arguments: { items: [] } });
        const body = await response.json();
        expect(body.result?.isError === true || !!body.error).toBe(true);
        expect(await state.client.errorItem.count()).toBe(count);
    });
});
