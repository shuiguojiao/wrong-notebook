// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createAgentTestDatabase } from "@/__tests__/helpers/agent-database";

const state = vi.hoisted(() => ({ client: undefined as unknown as PrismaClient, ai: vi.fn(), mastery: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, {
    get(_target, key) {
        const value = Reflect.get(state.client, key);
        return typeof value === "function" ? value.bind(state.client) : value;
    },
}) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => null) }));
vi.mock("@/lib/ai", () => ({ getAIService: state.ai }));
vi.mock("@/lib/mastery", () => ({ scheduleMasteryEvaluation: state.mastery }));
import { GET as notebooks } from "@/app/api/agent/notebooks/route";
import { GET as tags } from "@/app/api/agent/tags/route";
import { POST as duplicates } from "@/app/api/agent/duplicates/route";
import { POST as createItems } from "@/app/api/agent/error-items/route";
import { createAgentToken } from "@/lib/agent-token";
import { isPublicImageAddress } from "@/lib/agent/image";
import { imageDataUrl } from "@/lib/image-storage";

let database: ReturnType<typeof createAgentTestDatabase>;
let token: string;
let otherToken: string;
let notebookId: string;
let otherNotebookId: string;
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
function request(path: string, data?: unknown, bearer = token) {
    return new Request(`https://notebook.example${path}`, {
        method: data === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${bearer}`, ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
}
beforeAll(async () => {
    database = createAgentTestDatabase();
    state.client = database.client;
    const user = await state.client.user.create({ data: { email: "agent-a@example.com", password: "test-only", gradeRecognitionMode: "ai" } });
    const other = await state.client.user.create({ data: { email: "agent-b@example.com", password: "test-only" } });
    token = (await createAgentToken(user.id, "test"))!.token;
    otherToken = (await createAgentToken(other.id, "test"))!.token;
    notebookId = (await state.client.subject.create({ data: { userId: user.id, name: "数学", subjectKey: "math" } })).id;
    otherNotebookId = (await state.client.subject.create({ data: { userId: other.id, name: "私有数学", subjectKey: "math" } })).id;
    await state.client.knowledgeTag.createMany({ data: [
        { name: "一元一次方程", subject: "math", isSystem: true },
        { name: "别人的标签", subject: "math", userId: other.id },
    ] });
    await state.client.knowledgeTag.createMany({ data: Array.from({ length: 55 }, (_, index) => ({
        name: `批量搜索标签${index}`, subject: "math", isSystem: true,
    })) });
});
afterAll(async () => { await database?.dispose(); });

describe("代理结构化导入（真实数据库）", () => {
    it("所有端点拒绝未授权访问及撤销令牌", async () => {
        for (const route of [notebooks, tags, duplicates, createItems]) {
            expect((await route(new Request("https://notebook.example/api/agent/test"))).status).toBe(401);
        }
        const user = await state.client.user.findUniqueOrThrow({ where: { email: "agent-a@example.com" } });
        const revoked = (await createAgentToken(user.id, "revoked"))!;
        await state.client.agentToken.update({ where: { id: revoked.id }, data: { revokedAt: new Date() } });
        expect((await notebooks(request("/api/agent/notebooks", undefined, revoked.token))).status).toBe(401);
    });
    it("列表与标签查询隔离用户和错题本，标签查询最多 50 项", async () => {
        const list = await (await notebooks(request("/api/agent/notebooks"))).json();
        expect(list.notebooks.map((item: { id: string }) => item.id)).toEqual([notebookId]);
        const response = await tags(request(`/api/agent/tags?subjectId=${notebookId}&q=方程`));
        expect((await response.json()).tags.map((tag: { name: string }) => tag.name)).toEqual(["一元一次方程"]);
        expect((await tags(request(`/api/agent/tags?subjectId=${otherNotebookId}`))).status).toBe(404);
        const allTags = await (await tags(request(`/api/agent/tags?subjectId=${notebookId}`))).json();
        const limited = await (await tags(request(`/api/agent/tags?subjectId=${notebookId}&q=批量搜索标签`))).json();
        expect(limited.tags).toHaveLength(50);
        expect(allTags.tags.some((tag: { name: string }) => tag.name === "别人的标签")).toBe(false);
    });
    it("批量部分失败、已有标签匹配及自定义标签创建，不调用 AI", async () => {
        const response = await createItems(request("/api/agent/error-items", { items: [
            { notebookId, questionText: "求解方程 x + 2 = 5", wrongAnswerText: "x = 2", knowledgePoints: ["一元一次方程", "我新建的标签"], source: "数学周测", errorType: "计算错误", userNotes: "注意移项", difficultyStars: 2 },
            { notebookId: otherNotebookId, questionText: "越权题目" },
            { notebookId, questionText: "" },
        ] }));
        expect(response.status).toBe(200);
        const { results } = await response.json();
        expect(results[0]).toEqual(expect.objectContaining({ status: "created", shortId: expect.any(String), link: expect.stringContaining("/error-items/") }));
        expect(results[1].error).toBe("AGENT_NOTEBOOK_NOT_FOUND");
        expect(results[2].error).toBe("AGENT_INVALID_ITEM");
        const saved = await state.client.errorItem.findUniqueOrThrow({ where: { id: results[0].id }, include: { tags: true } });
        expect(saved.tags.map((tag) => tag.name).sort()).toEqual(["一元一次方程", "我新建的标签"].sort());
        expect(saved.tags.find((tag) => tag.name === "一元一次方程")?.isSystem).toBe(true);
        expect(saved).toEqual(expect.objectContaining({ originalImageUrl: "", source: "数学周测", errorType: "计算错误", userNotes: "注意移项", difficultyStars: 2 }));
        expect(state.ai).not.toHaveBeenCalled();
    });
    it("查重复用用户阈值、重复保存保留原题并记录做错，不调用后台 AI", async () => {
        const data = { questionText: "求解方程 x + 2 = 5" };
        const found = await (await duplicates(request("/api/agent/duplicates", data))).json();
        expect(found.duplicates).toHaveLength(1);
        expect((await (await duplicates(request("/api/agent/duplicates", data, otherToken))).json()).duplicates).toEqual([]);
        const result = await (await createItems(request("/api/agent/error-items", { items: [{ notebookId, ...data, wrongAnswerText: "x=7" }] }))).json();
        expect(result.results[0].status).toBe("duplicate");
        expect(await state.client.practiceRecord.count({ where: { errorItemId: found.duplicates[0].id } })).toBe(1);
        expect(state.ai).not.toHaveBeenCalled();
        expect(state.mastery).not.toHaveBeenCalled();
    });
    it("配图 SVG 与原图分开保存，净化脚本，仅声明配图时不占用原图", async () => {
        const figureSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20"><line x1="0" y1="10" x2="100" y2="10" stroke="black"/><script>alert(1)</script></svg>';
        const { results } = await (await createItems(request("/api/agent/error-items", { items: [
            { notebookId, questionText: "配图试题：如图，数轴上 A、B 两点", figureSvg, image: { base64: png, mimeType: "image/png" } },
            { notebookId, questionText: "配图试题：如图是一个运算程序", hasFigure: true },
        ] }))).json();
        const [withSvg, flagged] = await Promise.all(results.map((result: { id: string }) => state.client.errorItem.findUniqueOrThrow({ where: { id: result.id } })));
        expect(withSvg.hasFigure).toBe(true);
        expect(withSvg.figureSvg).toContain("<line");
        expect(withSvg.figureSvg).not.toContain("script");
        expect(withSvg.originalImageUrl).toMatch(/^local-image:/);
        expect(flagged).toEqual(expect.objectContaining({ hasFigure: true, figureSvg: null, originalImageUrl: "" }));
        expect(state.ai).not.toHaveBeenCalled();
    });
    it("图片经校验落盘，拒绝 MIME 不符、非法 base64、超限、混合输入与内网 URL", async () => {
        const images = [
            { base64: png, mimeType: "image/png" },
            { base64: png, mimeType: "image/jpeg" },
            { base64: "!!!!!", mimeType: "image/png" },
            { base64: "A".repeat(7 * 1024 * 1024), mimeType: "image/png" },
            { base64: png, mimeType: "image/png", url: "https://example.com/image.png" },
            { url: "https://127.0.0.1/image.png" },
        ];
        const response = await createItems(request("/api/agent/error-items", { items: images.map((image, index) => ({ notebookId, questionText: `图片试题${index}：计算 ${index} * 34567`, image })) }));
        const { results } = await response.json();
        expect(results[0].status).toBe("created");
        expect(results.slice(1).every((result: { error?: string }) => !!result.error)).toBe(true);
        const saved = await state.client.errorItem.findUniqueOrThrow({ where: { id: results[0].id } });
        expect(saved.originalImageUrl).toMatch(/^local-image:/);
        expect(await imageDataUrl(saved.originalImageUrl)).toBe(`data:image/png;base64,${png}`);
        expect(isPublicImageAddress("::ffff:127.0.0.1")).toBe(false);
        expect(isPublicImageAddress("192.168.1.1")).toBe(false);
        expect(isPublicImageAddress("8.8.8.8")).toBe(true);
    });
    it("按名称找本，新建需要显式选项，拒绝超过 20 题", async () => {
        const result = await (await createItems(request("/api/agent/error-items", { items: [
            { notebookName: "英语", questionText: "Translate apple into Chinese." },
            { notebookName: "英语", createNotebook: true, questionText: "Spell the past tense of go." },
        ] }))).json();
        expect(result.results[0].error).toBe("AGENT_NOTEBOOK_NOT_FOUND");
        expect(result.results[1].status).toBe("created");
        expect((await createItems(request("/api/agent/error-items", { items: Array.from({ length: 21 }, () => ({ notebookId, questionText: "123" })) }))).status).toBe(400);
    });
    it("同一用户的多个令牌共享速率限制", async () => {
        for (let i = 0; i < 60; i++) await notebooks(request("/api/agent/notebooks"));
        const response = await notebooks(request("/api/agent/notebooks"));
        expect(response.status).toBe(429);
        expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    });
});
