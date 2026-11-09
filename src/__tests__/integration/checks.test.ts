// @vitest-environment node
import type { PrismaClient, User } from "@prisma/client";
import { PNG } from "pngjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentTestDatabase } from "@/__tests__/helpers/agent-database";

const state = vi.hoisted(() => ({ client: undefined as unknown as PrismaClient, email: "" }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get(_target, key) {
    const value = Reflect.get(state.client, key);
    return typeof value === "function" ? value.bind(state.client) : value;
} }) }));
vi.mock("next-auth", () => ({ getServerSession: async () => state.email ? { user: { email: state.email } } : null }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
import { GET } from "@/app/api/checks/pending/route";
import { POST } from "@/app/api/checks/[errorItemId]/resolve/route";
import { checkContext } from "@/lib/question/check-metadata";
import { mergeAiCheckIssues, parseCheckIssues } from "@/lib/question/check-store";
import { scheduleIntegrityCheck } from "@/lib/question/integrity-queue";
import type { StoredCheckIssue } from "@/lib/question/check-store";
import { PUT as replaceImage } from "@/app/api/error-items/[id]/image/route";
import { saveSourcePage } from "@/lib/source-page";

let database: ReturnType<typeof createAgentTestDatabase>;
let user: User;
let other: User;
const diff: StoredCheckIssue = { code: "text_diff", field: "questionText", visibility: "user", severity: "major", source: "ai", suggestion: { textSays: "kě", imageSays: "kěn" } };
const mismatch: StoredCheckIssue = { code: "image_mismatch", field: "originalImageUrl", visibility: "user", severity: "major", source: "ai" };
const regions = [{ x: 0.1, y: 0.2, width: 0.6, height: 0.3 }];

beforeAll(() => { database = createAgentTestDatabase(); state.client = database.client; });
afterAll(async () => { await database.dispose(); });
beforeEach(async () => {
    await state.client.user.deleteMany();
    user = await state.client.user.create({ data: { email: "checks@example.test", password: "test" } });
    other = await state.client.user.create({ data: { email: "other@example.test", password: "test" } });
    state.email = user.email;
});
async function item(extra: Record<string, unknown> = {}) {
    return state.client.errorItem.create({ data: { userId: user.id, originalImageUrl: "", questionText: "kě（ ）求 kě", answerText: "答案",
        checkStatus: "flagged", checkedAt: new Date(), checkIssues: JSON.stringify([diff]), ...extra } });
}
async function pending(ids?: string[]) {
    const response = await GET(new Request(`http://localhost/api/checks/pending${ids ? `?ids=${ids.join(",")}` : ""}`));
    return response.json();
}
async function resolve(id: string, body: Record<string, unknown>) {
    return POST(new Request(`http://localhost/api/checks/${id}/resolve`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ errorItemId: id }) });
}
async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    const current = await state.client.errorItem.findUniqueOrThrow({ where: { id } });
    return resolve(id, { action, updatedAt: current.updatedAt.toISOString(), issueIndex: 0, ...extra });
}

describe("需要看一眼接口（隔离 SQLite）", () => {
    it("只列本人未忽略未修复的用户问题，按检查发现时间排序，支持结果页过滤", async () => {
        const first = await item({ checkedAt: new Date("2026-01-01") });
        const second = await item({ checkedAt: new Date("2026-01-02"), checkIssues: JSON.stringify([diff, { ...mismatch, dismissed: true }, { ...diff, resolved: true }, { ...diff, visibility: "agent" }]) });
        await item({ userId: other.id });
        await item({ checkIssues: JSON.stringify([{ ...diff, dismissed: true }]) });
        expect(await pending()).toMatchObject({ total: 2, items: [{ id: first.id }, { id: second.id, issues: [{ code: "text_diff", index: 0 }] }] });
        expect(await pending([second.id])).toMatchObject({ total: 1, items: [{ id: second.id }] });
    });
    it("采用建议只替换一处，保留其他问题，重跑规则并排队 AI", async () => {
        const current = await item({ checkIssues: JSON.stringify([diff, mismatch]) });
        const response = await act(current.id, "accept");
        expect(response.status).toBe(200);
        const saved = await state.client.errorItem.findUniqueOrThrow({ where: { id: current.id } });
        expect(saved.questionText).toBe("kěn（ ）求 kě");
        expect(parseCheckIssues(saved.checkIssues)).toContainEqual(expect.objectContaining({ ...diff, resolved: true }));
        expect((await pending()).items[0].issues).toEqual([expect.objectContaining({ code: "image_mismatch" })]);
        expect(saved.checkedAt).not.toEqual(current.checkedAt);
        expect(scheduleIntegrityCheck).toHaveBeenCalledWith(current.id);
    });
    it("找不到片段或没有具体建议时明确报错，数据库保持原值", async () => {
        const current = await item({ questionText: "另一道题" });
        const response = await act(current.id, "accept");
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ message: "CHECK_TEXT_NOT_FOUND" });
        expect(await state.client.errorItem.findUniqueOrThrow({ where: { id: current.id } })).toEqual(current);
        const invalid = await item({ checkIssues: JSON.stringify([mismatch]) });
        expect((await act(invalid.id, "accept")).status).toBe(400);
        expect(scheduleIntegrityCheck).not.toHaveBeenCalled();
    });
    it("建议中的 $ 替换符按字面保存", async () => {
        const current = await item({ checkIssues: JSON.stringify([{ ...diff, suggestion: { textSays: "kě", imageSays: "$&$'" } }]) });
        expect((await act(current.id, "accept")).status).toBe(200);
        expect((await state.client.errorItem.findUniqueOrThrow({ where: { id: current.id } })).questionText).toBe("$&$'（ ）求 kě");
    });
    it("没问题按 code+field 忽略同类条目，AI 重检后仍不再提醒", async () => {
        const current = await item({ checkIssues: JSON.stringify([diff, { ...diff, suggestion: { textSays: "求", imageSays: "球" } }]) });
        expect((await act(current.id, "dismiss", { durationMs: 6000 })).status).toBe(200);
        let saved = await state.client.errorItem.findUniqueOrThrow({ where: { id: current.id } });
        expect(checkContext(parseCheckIssues(saved.checkIssues))?.handling).toEqual([expect.objectContaining({ code: "text_diff", action: "dismiss", durationMs: 6000 })]);
        expect(parseCheckIssues(saved.checkIssues).filter(issue => issue.visibility === "user")).toEqual([expect.objectContaining({ ...diff, dismissed: true }), expect.objectContaining({ ...diff, dismissed: true, suggestion: { textSays: "求", imageSays: "球" } })]);
        expect(await pending()).toMatchObject({ total: 0, items: [] });
        await state.client.errorItem.update({ where: { id: current.id }, data: mergeAiCheckIssues(saved.checkIssues, [diff], "mock") });
        saved = await state.client.errorItem.findUniqueOrThrow({ where: { id: current.id } });
        expect(parseCheckIssues(saved.checkIssues)[0].dismissed).toBe(true);
        expect(await pending()).toMatchObject({ total: 0 });
        expect(scheduleIntegrityCheck).not.toHaveBeenCalled();
    });
    it("删除要求确认并复用级联清理", async () => {
        const current = await item();
        await state.client.practiceRecord.create({ data: { userId: user.id, errorItemId: current.id, result: "wrong" } });
        expect((await resolve(current.id, { action: "delete", updatedAt: current.updatedAt.toISOString() })).status).toBe(400);
        expect((await resolve(current.id, { action: "delete", updatedAt: current.updatedAt.toISOString(), confirm: true })).status).toBe(200);
        expect(await state.client.errorItem.findUnique({ where: { id: current.id } })).toBeNull();
        expect(await state.client.practiceRecord.count({ where: { errorItemId: current.id } })).toBe(0);
    });
    it("重新框选从本人出处重裁，替换框并重新排队，保留其他页区域", async () => {
        const current = await item({ checkIssues: JSON.stringify([mismatch]) });
        const page = (await saveSourcePage(user.id, PNG.sync.write(new PNG({ width: 80, height: 100 })), "image/png")).page;
        const second = (await saveSourcePage(user.id, PNG.sync.write(new PNG({ width: 80, height: 120 })), "image/png")).page;
        for (const [order, pageId] of [page.id, second.id].entries()) await state.client.questionRegion.create({ data: { ...regions[0], pageId, errorItemId: current.id, order } });
        const response = await resolve(current.id, { action: "reframe", updatedAt: current.updatedAt.toISOString(), pageId: page.id, regions: [{ ...regions[0], x: 0.2 }] });
        expect(response.status).toBe(200);
        const saved = await state.client.errorItem.findUniqueOrThrow({ where: { id: current.id }, include: { questionRegions: { orderBy: { order: "asc" } } } });
        expect(saved.questionRegions).toMatchObject([{ pageId: page.id, x: 0.2 }, { pageId: second.id, ...regions[0] }]);
        expect(saved.originalImageUrl).toMatch(/^local-image:/);
        expect(parseCheckIssues(saved.checkIssues)).toContainEqual(expect.objectContaining({ code: "image_mismatch", resolved: true }));
        expect(scheduleIntegrityCheck).toHaveBeenCalledWith(current.id);
    });
    it("已有补图流程带核对版本时结清旧图证据，过期版本不覆盖图片", async () => {
        const current = await item({ checkIssues: JSON.stringify([mismatch]) });
        const request = () => replaceImage(new Request("http://localhost/image", { method: "PUT", body: JSON.stringify({
            imageDataUrl: `data:image/png;base64,${PNG.sync.write(new PNG({ width: 10, height: 10 })).toString("base64")}`,
            expectedUpdatedAt: current.updatedAt.toISOString(),
        }) }), { params: Promise.resolve({ id: current.id }) });
        expect((await request()).status).toBe(200);
        expect(await pending()).toMatchObject({ total: 0 });
        const saved = await state.client.errorItem.findUniqueOrThrow({ where: { id: current.id } });
        expect(parseCheckIssues(saved.checkIssues)).toContainEqual(expect.objectContaining({ code: "image_mismatch", resolved: true }));
        expect((await request()).status).toBe(409);
        expect(await state.client.errorItem.findUniqueOrThrow({ where: { id: current.id } })).toEqual(saved);
    });
    it("无出处、不属于本题的出处与非法区域均拒绝", async () => {
        const current = await item();
        expect((await resolve(current.id, { action: "reframe", updatedAt: current.updatedAt.toISOString(), pageId: "other-page", regions })).status).toBe(400);
        for (const invalid of [[], Array(5).fill(regions[0]), [{ ...regions[0], x: 0.9 }]]) {
            expect((await resolve(current.id, { action: "reframe", updatedAt: current.updatedAt.toISOString(), pageId: "none", regions: invalid })).status).toBe(400);
        }
    });
    it.each(["accept", "dismiss", "delete", "reframe"])("%s 拒绝他人题目与过期版本", async action => {
        const current = await item({ userId: other.id });
        const body = { action, updatedAt: current.updatedAt.toISOString(), ...(action === "delete" ? { confirm: true } : action === "reframe" ? { pageId: "none", regions } : { issueIndex: 0 }) };
        expect((await resolve(current.id, body)).status).toBe(404);
        await state.client.errorItem.update({ where: { id: current.id }, data: { userId: user.id, updatedAt: new Date(current.updatedAt.getTime() + 1000) } });
        const response = await resolve(current.id, body);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ message: "CHECK_CONFLICT" });
    });
    it("相同版本的两个并发操作仅成功一个", async () => {
        const current = await item();
        const body = { action: "accept", issueIndex: 0, updatedAt: current.updatedAt.toISOString() };
        const responses = await Promise.all([resolve(current.id, body), resolve(current.id, body)]);
        expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
        expect((await state.client.errorItem.findUniqueOrThrow({ where: { id: current.id } })).questionText).toBe("kěn（ ）求 kě");
    });
    it("未登录不能列出或处理问题", async () => {
        const current = await item(); state.email = "";
        expect((await GET(new Request("http://localhost/api/checks/pending"))).status).toBe(401);
        expect((await act(current.id, "accept")).status).toBe(401);
    });
});
