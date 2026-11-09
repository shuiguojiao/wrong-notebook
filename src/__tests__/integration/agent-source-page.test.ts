// @vitest-environment node
import type { PrismaClient, User } from "@prisma/client";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
import { POST as upload } from "@/app/api/agent/source-pages/route";
import { POST as create } from "@/app/api/agent/error-items/route";
import { GET as detail } from "@/app/api/agent/error-items/detail/route";
import { GET as search } from "@/app/api/agent/error-items/search/route";
import { GET as image } from "@/app/api/agent/error-items/image/route";
import { PATCH as update } from "@/app/api/agent/error-items/update/route";
import { DELETE as remove } from "@/app/api/agent/error-items/delete/route";
import { createAgentToken } from "@/lib/agent-token";
import { imageDataUrl, readStoredImage } from "@/lib/image-storage";
import { pruneImages } from "@/lib/image-maintenance";
import { saveSourcePage } from "@/lib/source-page";

let database: ReturnType<typeof createAgentTestDatabase>;
let user: User;
let other: User;
let token: string;
let notebookId: string;
const pageBytes = PNG.sync.write(new PNG({ width: 120, height: 200 }));
const page = { base64: pageBytes.toString("base64"), mimeType: "image/png" };
const regions = [{ x: 0.1, y: 0.1, width: 0.8, height: 0.2 }, { x: 0.2, y: 0.6, width: 0.5, height: 0.3 }];
function request(path: string, method: string, data?: unknown, bearer = token) {
    return new Request(`https://notebook.example/api/agent/${path}`, {
        method, headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
}
async function read(id: string) { return (await (await detail(request(`error-items/detail?id=${id}`, "GET"))).json()).item; }
async function createItem(sourcePage?: unknown, questionText = "求三角形的面积，底是十二，高是九") {
    const response = await create(request("error-items", "POST", { items: [{ notebookId, questionText, ...(sourcePage ? { sourcePage } : { image: page }) }] }));
    return (await response.json()).results[0];
}
beforeAll(() => { database = createAgentTestDatabase(); state.client = database.client; });
afterAll(async () => { await database?.dispose(); });
beforeEach(async () => {
    const number = await state.client.user.count();
    user = await state.client.user.create({ data: { email: `source-${number}@example.com`, password: "test-only", questionDuplicateThreshold: 100 } });
    other = await state.client.user.create({ data: { email: `source-other-${number}@example.com`, password: "test-only" } });
    token = (await createAgentToken(user.id, "source-test"))!.token;
    notebookId = (await state.client.subject.create({ data: { userId: user.id, name: "数学", subjectKey: "math" } })).id;
});

describe("代理出处页完整流程（临时 SQLite 与图片目录）", () => {
    it("文字 source 与 sourcePage 可同时提交，详情和搜索保留文字来源字段", async () => {
        const source = "语文七年级上.pdf｜PDF第7页｜第3题";
        const response = await create(request("error-items", "POST", { items: [{ notebookId, questionText: "出处与文字来源兼容", source, sourcePage: { page, regions } }] }));
        const saved = (await response.json()).results[0];
        expect(saved.status).toBe("created");
        const current = await read(saved.id);
        expect(current).toMatchObject({ source, sourcePage: { pageId: expect.any(String), regions } });
        expect(current).not.toHaveProperty("sourceText");
        const found = await search(request(`error-items/search?source=${encodeURIComponent(source)}`, "GET"));
        expect((await found.json()).items).toEqual([expect.objectContaining({ id: saved.id, source })]);
        const changed = await update(request("error-items/update", "PATCH", { id: saved.id, expectedRevision: current.revision,
            patch: { source: "修正后的文字来源", sourcePage: { pageId: current.sourcePage.pageId, regions: [regions[0]] } } }));
        expect(changed.status).toBe(200);
        const updated = (await changed.json()).item;
        expect(updated).toMatchObject({ source: "修正后的文字来源", sourcePage: { pageId: current.sourcePage.pageId, regions: [regions[0]] } });
        expect(updated).not.toHaveProperty("sourceText");
        const cleared = await update(request("error-items/update", "PATCH", { id: saved.id, expectedRevision: updated.revision, patch: { source: null } }));
        expect((await cleared.json()).item).toMatchObject({ source: null, sourcePage: updated.sourcePage });
        const invalid = await create(request("error-items", "POST", { items: [{ notebookId, questionText: "无效文字来源", source: { page, regions } }] }));
        expect((await invalid.json()).results[0]).toMatchObject({ error: "AGENT_INVALID_ITEM", fields: ["source"] });
        const invalidUpdate = await update(request("error-items/update", "PATCH", { id: saved.id, expectedRevision: updated.revision, patch: { source: { page, regions } } }));
        expect(invalidUpdate.status).toBe(400);
        expect((await invalidUpdate.json()).message).toBe("AGENT_INVALID_INPUT");
    });
    it.each(["pageId", "page"] as const)("通过 %s 导入时仅补齐共享页空页码，已有文件名和页码保持不变", async (kind) => {
        const uploaded = await saveSourcePage(user.id, pageBytes, "image/png", { fileName: "原试卷.png" });
        const input = kind === "pageId" ? { pageId: uploaded.page.id } : { page };
        const first = await createItem({ ...input, fileName: "忽略名称.png", pageNumber: 7, regions });
        expect(first.status).toBe("created");
        const expected = { pageId: uploaded.page.id, fileName: "原试卷.png", pageNumber: 7, regions };
        expect((await read(first.id)).sourcePage).toEqual(expected);
        const second = await createItem({ ...input, fileName: "另一名称.png", pageNumber: 9, regions }, "另一道题保留共享页原始元信息");
        expect(second.status).toBe("created");
        expect((await read(second.id)).sourcePage).toEqual(expected);
        expect((await read(first.id)).sourcePage).toEqual(expected);
    });
    it.each(["pageId", "page"] as const)("通过 %s 更新时仅补齐共享页空文件名，冲突元信息不报错且不覆盖", async (kind) => {
        const uploaded = await saveSourcePage(user.id, pageBytes, "image/png", { pageNumber: 3 });
        // 兼容旧数据中用空字符串表示缺失文件名的情况。
        if (kind === "page") await state.client.sourcePage.update({ where: { id: uploaded.page.id }, data: { fileName: "" } });
        const linked = await createItem({ pageId: uploaded.page.id, regions });
        const saved = await createItem(undefined, "旧题补出处时保护共享页元信息");
        const current = await read(saved.id);
        const input = kind === "pageId" ? { pageId: uploaded.page.id } : { page };
        const response = await update(request("error-items/update", "PATCH", { id: saved.id, expectedRevision: current.revision,
            patch: { sourcePage: { ...input, fileName: "补充名称.png", pageNumber: 8, regions } } }));
        expect(response.status).toBe(200);
        const updated = (await response.json()).item;
        const expected = { pageId: uploaded.page.id, fileName: "补充名称.png", pageNumber: 3, regions };
        expect(updated.sourcePage).toEqual(expected);
        const retried = await update(request("error-items/update", "PATCH", { id: saved.id, expectedRevision: updated.revision,
            patch: { sourcePage: { ...input, fileName: "忽略修改.png", pageNumber: 9, regions } } }));
        expect(retried.status).toBe(200);
        expect((await retried.json()).item.sourcePage).toEqual(expected);
        expect((await read(linked.id)).sourcePage).toEqual(expected);
    });
    it("上传整页 → 多区域导入 → 读回出处与 JPEG 题图，同用户上传去重", async () => {
        const uploaded = await upload(request("source-pages", "POST", { ...page, fileName: "试卷.png", pageNumber: 2 }));
        expect(uploaded.status).toBe(200);
        const result = await uploaded.json();
        expect(result).toMatchObject({ width: 120, height: 200, reused: false });
        const reused = await (await upload(request("source-pages", "POST", page))).json();
        expect(reused).toMatchObject({ pageId: result.pageId, reused: true });
        const saved = await createItem({ pageId: result.pageId, regions });
        expect(saved.status).toBe("created");
        expect((await read(saved.id)).sourcePage).toEqual({ pageId: result.pageId, fileName: "试卷.png", pageNumber: 2, regions });
        const response = await image(request(`error-items/image?id=${saved.id}`, "GET"));
        expect(response.headers.get("content-type")).toBe("image/jpeg");
        const decoded = jpeg.decode(Buffer.from(await response.arrayBuffer()));
        expect(decoded.width).toBeGreaterThan(0);
        expect(decoded.height).toBeGreaterThan(decoded.width);
        expect(await state.client.questionRegion.count({ where: { errorItemId: saved.id } })).toBe(2);
        expect(state.ai).not.toHaveBeenCalled();
    });
    it("旧 image 方式兼容，update 补出处及替换区域，换图时清区域", async () => {
        const saved = await createItem();
        const old = await read(saved.id);
        expect(old.sourcePage).toBeNull();
        expect(old.source).toBe("agent");
        expect(old).not.toHaveProperty("sourceText");
        const stored = await state.client.errorItem.findUniqueOrThrow({ where: { id: saved.id } });
        expect(await imageDataUrl(stored.originalImageUrl)).toBe(`data:image/png;base64,${page.base64}`);
        const first = await update(request("error-items/update", "PATCH", { id: saved.id, expectedRevision: old.revision,
            patch: { sourcePage: { page, fileName: "内嵌.png", pageNumber: 3, regions } } }));
        expect(first.status).toBe(200);
        const current = (await first.json()).item;
        expect(current.sourcePage).toMatchObject({ fileName: "内嵌.png", pageNumber: 3, regions });
        const replacement = [regions[1]];
        const second = await update(request("error-items/update", "PATCH", { id: saved.id, expectedRevision: current.revision,
            patch: { sourcePage: { pageId: current.sourcePage.pageId, regions: replacement } } }));
        const updated = (await second.json()).item;
        expect(updated.sourcePage.regions).toEqual(replacement);
        expect(await state.client.questionRegion.count({ where: { errorItemId: saved.id } })).toBe(1);
        expect((await update(request("error-items/update", "PATCH", { id: saved.id, expectedRevision: old.revision, patch: { sourcePage: { pageId: current.sourcePage.pageId, regions } } }))).status).toBe(409);
        const cleared = await update(request("error-items/update", "PATCH", { id: saved.id, expectedRevision: updated.revision, patch: { image: page } }));
        expect((await cleared.json()).item.sourcePage).toBeNull();
        expect(await state.client.questionRegion.count({ where: { errorItemId: saved.id } })).toBe(0);
        const after = await state.client.errorItem.findUniqueOrThrow({ where: { id: saved.id } });
        expect((await readStoredImage(after.originalImageUrl))?.mimeType).toBe("image/png");
    });
    it("不同用户可保存相同字节，但不能使用他人的 pageId", async () => {
        const foreign = await saveSourcePage(other.id, pageBytes, "image/png");
        const own = await saveSourcePage(user.id, pageBytes, "image/png");
        expect(foreign.page.id).not.toBe(own.page.id);
        expect((await createItem({ pageId: foreign.page.id, regions })).error).toBe("AGENT_SOURCE_PAGE_NOT_FOUND");
        expect((await createItem({ pageId: "missing", regions })).error).toBe("AGENT_SOURCE_PAGE_NOT_FOUND");
        const saved = await createItem();
        const current = await read(saved.id);
        expect((await update(request("error-items/update", "PATCH", { id: saved.id, expectedRevision: current.revision,
            patch: { sourcePage: { pageId: foreign.page.id, regions } } }))).status).toBe(404);
        expect(await state.client.questionRegion.count({ where: { errorItemId: saved.id } })).toBe(0);
    });
    it("删除最后一道题后，维护预览保留数据，执行清理删除孤儿页及文件", async () => {
        const uniquePage = PNG.sync.write(new PNG({ width: 121, height: 201 }));
        const saved = await createItem({ page: { base64: uniquePage.toString("base64"), mimeType: "image/png" }, regions });
        const current = await read(saved.id);
        const sourcePage = await state.client.sourcePage.findUniqueOrThrow({ where: { id: current.sourcePage.pageId } });
        await pruneImages(state.client, true);
        expect(await readStoredImage(sourcePage.imageUrl)).not.toBeNull();
        const response = await remove(request("error-items/delete", "DELETE", { id: saved.id, expectedRevision: current.revision, confirm: true }));
        expect(response.status).toBe(200);
        expect(await state.client.questionRegion.count({ where: { pageId: sourcePage.id } })).toBe(0);
        await pruneImages(state.client);
        expect(await state.client.sourcePage.findUnique({ where: { id: sourcePage.id } })).not.toBeNull();
        await pruneImages(state.client, true);
        expect(await state.client.sourcePage.findUnique({ where: { id: sourcePage.id } })).toBeNull();
        await expect(readStoredImage(sourcePage.imageUrl)).rejects.toMatchObject({ code: "ENOENT" });
    });
    it("读回 B1 已有跨页数据时保留各区域的页归属", async () => {
        const saved = await createItem({ page, fileName: "跨页.png", pageNumber: 1, regions });
        const nextBytes = PNG.sync.write(new PNG({ width: 122, height: 202 }));
        const next = await saveSourcePage(user.id, nextBytes, "image/png", { fileName: "跨页.png", pageNumber: 2 });
        await state.client.questionRegion.create({ data: { errorItemId: saved.id, pageId: next.page.id, order: 2, ...regions[0] } });
        const current = await read(saved.id);
        expect(current.sourcePage.regions).toHaveLength(3);
        expect(current.sourcePage.regions[0]).toMatchObject({ ...regions[0], pageId: current.sourcePage.pageId, pageNumber: 1 });
        expect(current.sourcePage.regions[2]).toEqual({ ...regions[0], pageId: next.page.id, fileName: "跨页.png", pageNumber: 2 });
    });
    it("区域写入失败时回滚题图、题目字段与共享页元信息", async () => {
        const saved = await createItem({ page, fileName: "原名.png", regions });
        const before = await read(saved.id);
        const original = await state.client.errorItem.findUniqueOrThrow({ where: { id: saved.id } });
        await state.client.$executeRawUnsafe(`CREATE TRIGGER fail_source_regions BEFORE INSERT ON "QuestionRegion" BEGIN SELECT RAISE(ABORT, 'test-source-write'); END`);
        try {
            const response = await update(request("error-items/update", "PATCH", { id: saved.id, expectedRevision: before.revision,
                patch: { questionText: "不应写入", sourcePage: { pageId: before.sourcePage.pageId, fileName: "不应改名.png", pageNumber: 7, regions: [regions[1]] } } }));
            expect(response.status).toBe(500);
            expect(await read(saved.id)).toMatchObject({ questionText: before.questionText, sourcePage: before.sourcePage, revision: before.revision });
            expect((await state.client.errorItem.findUniqueOrThrow({ where: { id: saved.id } })).originalImageUrl).toBe(original.originalImageUrl);
            const count = await state.client.errorItem.count({ where: { userId: user.id } });
            const failed = await createItem({ pageId: before.sourcePage.pageId, regions }, "区域失败后这道新题也应回滚");
            expect(failed.error).toEqual(expect.any(String));
            expect(await state.client.errorItem.count({ where: { userId: user.id } })).toBe(count);
        } finally {
            await state.client.$executeRawUnsafe('DROP TRIGGER fail_source_regions');
        }
    });
    it("重复导入保留原题及出处，裁图保存到该次做错快照", async () => {
        await state.client.user.update({ where: { id: user.id }, data: { questionDuplicateThreshold: 80 } });
        const first = await createItem({ page, regions });
        const before = await read(first.id);
        const duplicate = await createItem({ page, regions: [regions[1]] });
        expect(duplicate).toMatchObject({ id: first.id, status: "duplicate", practiceRecordId: expect.any(String) });
        expect((await read(first.id)).sourcePage).toEqual(before.sourcePage);
        const record = await state.client.practiceRecord.findUniqueOrThrow({ where: { id: duplicate.practiceRecordId } });
        expect((await readStoredImage(record.originalImageUrl!))?.mimeType).toBe("image/jpeg");
        expect(await state.client.questionRegion.count({ where: { errorItemId: first.id } })).toBe(2);
    });
    it("拒绝无令牌、WebP、超大尺寸、内网 URL、互斥参数与非法区域", async () => {
        expect((await upload(request("source-pages", "POST", page, ""))).status).toBe(401);
        const webp = await upload(request("source-pages", "POST", { base64: Buffer.from("RIFF0000WEBP").toString("base64"), mimeType: "image/webp" }));
        expect((await webp.json()).message).toBe("AGENT_SOURCE_FORMAT_UNSUPPORTED");
        const invalid = Buffer.from(pageBytes);
        invalid.writeUInt32BE(4097, 16);
        const huge = await upload(request("source-pages", "POST", { ...page, base64: invalid.toString("base64") }));
        expect((await huge.json()).message).toBe("AGENT_SOURCE_DIMENSIONS_EXCEEDED");
        expect((await upload(request("source-pages", "POST", { url: "https://127.0.0.1/page.png" }))).status).toBe(400);
        expect((await createItem({ page, regions: [] })).error).toBe("AGENT_SOURCE_INVALID");
        const mixed = await create(request("error-items", "POST", { items: [{ notebookId, questionText: "互斥", sourcePage: { page, regions }, image: page }] }));
        expect((await mixed.json()).results[0].error).toBe("AGENT_SOURCE_INVALID");
    });
    it("上传整页与其他写操作共享每用户 10 次额度", async () => {
        for (let index = 0; index < 10; index++) expect((await upload(request("source-pages", "POST", page))).status).toBe(200);
        const blocked = await create(request("error-items", "POST", { items: [{ notebookId, questionText: "限流" }] }));
        expect(blocked.status).toBe(429);
    });
});
