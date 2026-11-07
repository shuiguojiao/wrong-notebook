// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient, User } from "@prisma/client";
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
import { GET as search } from "@/app/api/agent/error-items/search/route";
import { GET as detail } from "@/app/api/agent/error-items/detail/route";
import { GET as image } from "@/app/api/agent/error-items/image/route";
import { PATCH as update } from "@/app/api/agent/error-items/update/route";
import { DELETE as remove } from "@/app/api/agent/error-items/delete/route";
import { PATCH as updateRecord } from "@/app/api/agent/error-items/records/update/route";
import { DELETE as removeRecord } from "@/app/api/agent/error-items/records/delete/route";
import { createAgentToken } from "@/lib/agent-token";
import { storeImage } from "@/lib/image-storage";

let database: ReturnType<typeof createAgentTestDatabase>;
let user: User;
let token: string;
let otherToken: string;
let notebookId: string;
let targetId: string;
let otherNotebookId: string;
let id: string;
let recordId: string;
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10"/><script>alert(1)</script></svg>';
function req(path: string, method = "GET", data?: unknown, bearer = token) {
    return new Request(`https://notebook.example/api/agent/error-items/${path}`, {
        method, headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
}
async function current() { return (await (await detail(req(`detail?id=${id}`))).json()).item; }
async function edit(patch: unknown, revision?: string) {
    return update(req("update", "PATCH", { id, expectedRevision: revision ?? (await current()).revision, patch }));
}
beforeAll(() => { database = createAgentTestDatabase(); state.client = database.client; });
afterAll(async () => { await database?.dispose(); });
beforeEach(async () => {
    const number = await state.client.user.count();
    user = await state.client.user.create({ data: { email: `edit-${number}@example.com`, password: "test-only", gradeRecognitionMode: "ai" } });
    const other = await state.client.user.create({ data: { email: `other-${number}@example.com`, password: "test-only" } });
    token = (await createAgentToken(user.id, "test"))!.token;
    otherToken = (await createAgentToken(other.id, "test"))!.token;
    notebookId = (await state.client.subject.create({ data: { userId: user.id, name: "数学", subjectKey: "math" } })).id;
    targetId = (await state.client.subject.create({ data: { userId: user.id, name: "另一本数学", subjectKey: "math", tagSet: "advanced" } })).id;
    otherNotebookId = (await state.client.subject.create({ data: { userId: other.id, name: "别人的数学" } })).id;
    const tag = await state.client.knowledgeTag.create({ data: { userId: user.id, name: "方程", subject: "math" } });
    id = (await state.client.errorItem.create({ data: {
        userId: user.id, subjectId: notebookId, shortId: `T${number.toString().padStart(5, "0")}`,
        originalImageUrl: await storeImage(`data:image/png;base64,${png}`), questionText: "解方程 x + 2 = 5",
        answerText: "x = 3", analysis: "两边减二", wrongAnswerText: "x = 7", mistakeStatus: "wrong_attempt",
        source: "Exam.pdf 第2页 第8题", userNotes: "保留笔记", tags: { connect: { id: tag.id } },
    } })).id;
    recordId = (await state.client.practiceRecord.create({ data: {
        userId: user.id, errorItemId: id, source: "duplicate_import", result: "wrong", isCorrect: false,
        wrongAnswerText: "x = 8", originalImageUrl: await storeImage(`data:image/png;base64,${png}`),
    } })).id;
});

describe("代理导入后的查询与纠错（真实 SQLite）", () => {
    it("所有新端点必须使用有效令牌", async () => {
        for (const route of [search, detail, image, update, remove, updateRecord, removeRecord]) {
            expect((await route(req("test", "GET", undefined, ""))).status).toBe(401);
        }
    });
    it("来源/日期/错题本过滤与分页只返回本人题目，短编号详情包含版本和分页记录", async () => {
        await state.client.errorItem.create({ data: { userId: user.id, subjectId: notebookId, originalImageUrl: "", questionText: "另一题", source: "Exam.pdf 第3页" } });
        const page = await (await search(req(`search?notebookId=${notebookId}&source=Exam.pdf&limit=1&createdFrom=2020-01-01T00:00:00Z`))).json();
        expect(page).toMatchObject({ total: 2, nextOffset: 1 });
        expect(page.items).toHaveLength(1);
        expect((await (await search(req(`search?notebookId=${notebookId}&q=方程`))).json()).total).toBe(1);
        expect((await (await search(req(`search?createdBefore=2020-01-01T00:00:00Z`))).json()).total).toBe(0);
        expect((await (await search(req(`search?createdFrom=2020-01-01T08:00:00%2B08:00`))).json()).total).toBe(2);
        expect((await (await search(req("search", "GET", undefined, otherToken))).json()).total).toBe(0);
        expect((await search(req(`search?notebookId=${otherNotebookId}`))).status).toBe(404);
        expect((await search(req("search?limit=100"))).status).toBe(400);
        const saved = await current();
        const byShort = (await (await detail(req(`detail?id=${saved.shortId}&limit=1`))).json()).item;
        expect(byShort).toMatchObject({ id, recordTotal: 1, nextOffset: null, revision: saved.revision });
        expect(byShort.records[0]).toMatchObject({ id: recordId, editable: true });
        expect(byShort).not.toHaveProperty("userId");
        expect(byShort.records[0]).not.toHaveProperty("userId");
    });
    it("原题和记录原图可通过令牌读取，拒绝跨用户和不属于该题的记录", async () => {
        for (const path of [`image?id=${id}`, `image?id=${id}&recordId=${recordId}`]) {
            const response = await image(req(path));
            expect(response.status).toBe(200);
            expect(response.headers.get("Cache-Control")).toBe("no-store");
            expect(Buffer.from(await response.arrayBuffer()).toString("base64")).toBe(png);
            expect((await image(req(path, "GET", undefined, otherToken))).status).toBe(404);
        }
        expect((await image(req(`image?id=${id}&recordId=missing`))).status).toBe(404);
    });
    it("局部修改保持省略字段，净化配图、不新增记录，移动按目标标签体系匹配", async () => {
        const response = await edit({ questionText: "解方程 x + 2 = 6", answerText: "x = 4", figureSvg: svg, notebookId: targetId });
        expect(response.status).toBe(200);
        const item = (await response.json()).item;
        expect(item).toMatchObject({ questionText: "解方程 x + 2 = 6", answerText: "x = 4", notebookId: targetId, analysis: "两边减二", userNotes: "保留笔记", recordTotal: 1, hasFigure: true });
        expect(item.figureSvg).toContain("<path");
        expect(item.figureSvg).not.toContain("script");
        const tags = await state.client.knowledgeTag.findMany({ where: { errorItems: { some: { id } } } });
        expect(tags.map((tag) => tag.tagSet)).toEqual(["advanced"]);
        expect((await edit({ userNotes: null, wrongAnswerText: null, mistakeStatus: "not_attempted", image: null, knowledgePoints: [], hasFigure: false })).status).toBe(200);
        expect(await current()).toMatchObject({ userNotes: null, wrongAnswerText: null, mistakeStatus: "not_attempted", originalImageUrl: null, knowledgePoints: [], hasFigure: false, figureSvg: null, recordTotal: 1 });
        expect(state.ai).not.toHaveBeenCalled();
    });
    it("禁止跨用户访问/修改/删除及移入他人本，失败不改变数据", async () => {
        const item = await current();
        expect((await detail(req(`detail?id=${id}`, "GET", undefined, otherToken))).status).toBe(404);
        expect((await update(req("update", "PATCH", { id, expectedRevision: item.revision, patch: { answerText: "越权" } }, otherToken))).status).toBe(404);
        expect((await remove(req("delete", "DELETE", { id, expectedRevision: item.revision, confirm: true }, otherToken))).status).toBe(404);
        expect((await updateRecord(req("records/update", "PATCH", { id, expectedRevision: item.revision, recordId, patch: { wrongAnswerText: "越权" } }, otherToken))).status).toBe(404);
        expect((await removeRecord(req("records/delete", "DELETE", { id, expectedRevision: item.revision, recordId, confirm: true }, otherToken))).status).toBe(404);
        expect((await edit({ notebookId: otherNotebookId })).status).toBe(404);
        expect((await current()).revision).toBe(item.revision);
    });
    it("网页修改、记录内容修改和新增记录都使旧版本失效，并发修改只有一个成功", async () => {
        const old = await current();
        await state.client.errorItem.update({ where: { id }, data: { analysis: "用户网页修改" } });
        expect((await edit({ analysis: "旧内容" }, old.revision)).status).toBe(409);
        let item = await current();
        await state.client.practiceRecord.update({ where: { id: recordId }, data: { wrongAnswerText: "学生手工纠正" } });
        expect((await edit({ analysis: "旧内容" }, item.revision)).status).toBe(409);
        item = await current();
        await state.client.practiceRecord.create({ data: { userId: user.id, errorItemId: id, result: "correct" } });
        expect((await remove(req("delete", "DELETE", { id, expectedRevision: item.revision, confirm: true }))).status).toBe(409);
        item = await current();
        const responses = await Promise.all([edit({ answerText: "甲" }, item.revision), edit({ answerText: "乙" }, item.revision)]);
        expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
        expect((await current()).analysis).toBe("用户网页修改");
    });
    it("纠正与撤销重复记录保留原题及其他记录，并仅按规则重算掌握度", async () => {
        const practice = await state.client.practiceRecord.create({ data: { userId: user.id, errorItemId: id, source: "practice", result: "correct" } });
        const item = await current();
        const response = await updateRecord(req("records/update", "PATCH", {
            id, expectedRevision: item.revision, recordId, patch: { wrongAnswerText: null, result: "correct", notes: "核对原卷更正", figureSvg: svg },
        }));
        expect(response.status).toBe(200);
        const changed = (await response.json()).item;
        expect(changed).toMatchObject({ wrongAnswerText: "x = 7", recordTotal: 2, masterySource: "rule" });
        const saved = await state.client.practiceRecord.findUniqueOrThrow({ where: { id: recordId } });
        expect(saved).toMatchObject({ wrongAnswerText: null, result: "correct", isCorrect: true, notes: "核对原卷更正" });
        expect(saved.figureSvg).not.toContain("script");
        const deleted = await removeRecord(req("records/delete", "DELETE", { id, expectedRevision: changed.revision, recordId, confirm: true }));
        expect(deleted.status).toBe(200);
        expect((await deleted.json()).item).toMatchObject({ id, recordTotal: 1, wrongAnswerText: "x = 7", masterySource: "rule" });
        expect(await state.client.practiceRecord.findUnique({ where: { id: practice.id } })).not.toBeNull();
        expect(state.ai).not.toHaveBeenCalled();
    });
    it("只允许处理重复导入记录，不接收空补丁、任意字段或缺少删除确认", async () => {
        const item = await current();
        for (const patch of [{}, { userId: "someone" }, { questionText: " " }, { difficultyStars: 9 }]) expect((await edit(patch)).status).toBe(400);
        expect((await edit({ figureSvg: "invalid" })).status).toBe(400);
        expect((await edit({ hasFigure: false, figureSvg: svg })).status).toBe(400);
        expect((await edit({ image: { url: "https://127.0.0.1/image.png" } })).status).toBe(400);
        expect((await remove(req("delete", "DELETE", { id, expectedRevision: item.revision }))).status).toBe(400);
        await state.client.practiceRecord.update({ where: { id: recordId }, data: { source: "exam" } });
        const updated = await current();
        expect((await removeRecord(req("records/delete", "DELETE", { id, recordId, expectedRevision: updated.revision, confirm: true }))).status).toBe(400);
        expect((await updateRecord(req("records/update", "PATCH", { id, recordId, expectedRevision: updated.revision, patch: { result: "correct" } }))).status).toBe(400);
        expect(await state.client.errorItem.count({ where: { id } })).toBe(1);
    });
    it("撤销唯一记录清除掌握度，删除整题级联记录并保留试卷快照", async () => {
        const item = await current();
        const undone = await removeRecord(req("records/delete", "DELETE", { id, recordId, expectedRevision: item.revision, confirm: true }));
        expect((await undone.json()).item).toMatchObject({ recordTotal: 0, masteryLevel: 0, masteryProbability: null, masterySource: null });
        const paper = await state.client.examPaper.create({ data: { userId: user.id, title: "快照试卷", scope: "all", difficulty: "medium", requestedCount: 1, subjectIds: JSON.stringify([notebookId]) } });
        const question = await state.client.examQuestion.create({ data: { paperId: paper.id, order: 1, errorItemId: id, sourceShortId: item.shortId, questionText: "试卷快照题干" } });
        await state.client.practiceRecord.create({ data: { userId: user.id, errorItemId: id, result: "wrong" } });
        const fresh = await current();
        expect((await remove(req("delete", "DELETE", { id, expectedRevision: fresh.revision, confirm: true }))).status).toBe(200);
        expect(await state.client.errorItem.findUnique({ where: { id } })).toBeNull();
        expect(await state.client.practiceRecord.count({ where: { errorItemId: id } })).toBe(0);
        expect(await state.client.examQuestion.findUnique({ where: { id: question.id } })).toMatchObject({ errorItemId: null, questionText: "试卷快照题干" });
    });
});
