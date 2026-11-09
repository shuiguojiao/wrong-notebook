// @vitest-environment node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PrismaClient, User } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentTestDatabase } from "@/__tests__/helpers/agent-database";

const state = vi.hoisted(() => ({ client: undefined as unknown as PrismaClient, email: "", timeZone: "Asia/Shanghai" }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get(_target, key) {
    const value = Reflect.get(state.client, key);
    return typeof value === "function" ? value.bind(state.client) : value;
} }) }));
vi.mock("next-auth", () => ({ getServerSession: async () => state.email ? { user: { email: state.email } } : null }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/config", () => ({ getAppTimeZone: () => state.timeZone, getAppConfig: () => ({}) }));
vi.mock("@/lib/mastery", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/mastery")>(), scheduleMasteryEvaluation: vi.fn() }));
import { GET as detail } from "@/app/api/error-items/[id]/route";
import { POST as submit } from "@/app/api/practice/record/route";
import { GET as pending } from "@/app/api/checks/pending/route";
import { GET as stats } from "@/app/api/admin/question-integrity/route";
import { checkLegacyQuestion } from "@/lib/question/legacy-check";
import { releaseDeferredChecks, surfaceLegacyIssues } from "@/lib/question/legacy-surface";
import { checkContext } from "@/lib/question/check-metadata";
import { checkSavedQuestion, mergeAiCheckIssues, parseCheckIssues } from "@/lib/question/check-store";
import { visibleCheckIssues } from "@/lib/question/pending-checks";
import { scheduleIntegrityCheck } from "@/lib/question/integrity-queue";
import { runSerializedTransaction } from "@/lib/db-write-queue";
import { CHECK_VERSION } from "@/lib/question/check-rules";

let database: ReturnType<typeof createAgentTestDatabase>;
let user: User;
beforeAll(() => { database = createAgentTestDatabase(); state.client = database.client; });
afterAll(async () => { await database.dispose(); });
beforeEach(async () => {
    await state.client.user.deleteMany();
    user = await state.client.user.create({ data: { email: "legacy@example.test", password: "test" } });
    state.email = user.email;
});
async function item(questionText = "如图求解", userId = user.id) {
    return state.client.errorItem.create({ data: { userId, questionText, answerText: "答案", originalImageUrl: "" } });
}
async function stored(id: string) { return state.client.errorItem.findUniqueOrThrow({ where: { id } }); }
async function issues(id: string) { return parseCheckIssues((await stored(id)).checkIssues); }

describe("存量题按需检查与延后放出", () => {
    it("打开详情时同步检查，保留内容修订；当前版本再次打开不排队", async () => {
        const row = await item();
        const response = await detail(new Request("http://localhost/item"), { params: Promise.resolve({ id: row.id }) });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ needsCheck: true, checkVersion: CHECK_VERSION, updatedAt: row.updatedAt.toISOString() });
        expect(await stored(row.id)).toMatchObject({ checkVersion: CHECK_VERSION, checkedAt: expect.any(Date), updatedAt: row.updatedAt });
        expect(scheduleIntegrityCheck).not.toHaveBeenCalled();
        await detail(new Request("http://localhost/item"), { params: Promise.resolve({ id: row.id }) });
        expect(scheduleIntegrityCheck).not.toHaveBeenCalled();
    });
    it("仅本人的详情触发，未登录或他人题目不检查", async () => {
        const row = await item(); state.email = "";
        expect((await detail(new Request("http://localhost/item"), { params: Promise.resolve({ id: row.id }) })).status).toBe(401);
        const other = await state.client.user.create({ data: { email: "other@example.test", password: "test" } });
        state.email = other.email;
        expect((await detail(new Request("http://localhost/item"), { params: Promise.resolve({ id: row.id }) })).status).toBe(403);
        expect((await stored(row.id)).checkedAt).toBeNull();
    });
    it("复习判定先落盘再检查，练习提交不触发存量检查", async () => {
        const row = await item();
        const schedule = vi.mocked(scheduleIntegrityCheck);
        const request = (source: string) => submit(new Request("http://localhost/api/practice/record", {
            method: "POST", body: JSON.stringify({ errorItemId: row.id, source, result: "wrong" }),
        }));
        expect((await request("practice")).status).toBe(200);
        expect((await stored(row.id)).checkedAt).toBeNull();
        expect((await request("review")).status).toBe(200);
        expect(schedule).not.toHaveBeenCalled();
        expect(await state.client.practiceRecord.count()).toBe(2);
        expect((await stored(row.id)).checkVersion).toBe(CHECK_VERSION);
    });
    it("旧版本与空版本重检，版本未过期跳过；并发相同题只检查一次", async () => {
        const row = await item();
        await state.client.errorItem.update({ where: { id: row.id }, data: { checkedAt: new Date(), checkVersion: CHECK_VERSION - 1, originalImageUrl: "local-image:old.png" } });
        expect(await Promise.all([checkLegacyQuestion(row.id, user.id), checkLegacyQuestion(row.id, user.id)])).toEqual([true, false]);
        expect(scheduleIntegrityCheck).toHaveBeenCalledTimes(1);
        await state.client.errorItem.update({ where: { id: row.id }, data: { checkVersion: null } });
        expect(await checkLegacyQuestion(row.id, user.id, true)).toBe(true);
        expect(scheduleIntegrityCheck).toHaveBeenCalledTimes(1);
    });
    it("并发多题每天最多三题，处理或删除不回收额度，新导入题不受限", async () => {
        const rows = await Promise.all(Array.from({ length: 8 }, () => item()));
        await Promise.all(rows.map(row => checkLegacyQuestion(row.id, user.id, true)));
        const all = await Promise.all(rows.map(row => issues(row.id)));
        expect(all.filter(row => visibleCheckIssues(row).length)).toHaveLength(3);
        expect(all.filter(row => checkContext(row)?.deferredUntil)).toHaveLength(5);
        const surfaced = rows[all.findIndex(row => visibleCheckIssues(row).length)];
        await state.client.errorItem.delete({ where: { id: surfaced.id } });
        const extra = await item(); await checkLegacyQuestion(extra.id, user.id, true);
        expect(visibleCheckIssues(await issues(extra.id))).toEqual([]);
        const imported = await item(); await checkSavedQuestion(imported.id);
        expect(visibleCheckIssues(await issues(imported.id))).toHaveLength(1);
        expect((await (await pending(new Request("http://localhost/api/checks/pending"))).json()).total).toBe(3);
    });
    it("按应用时区跨日各放三题；跳过多日也只放三题，重复读取不重复扣费", async () => {
        const rows = await Promise.all(Array.from({ length: 10 }, () => item()));
        await Promise.all(rows.map(row => checkLegacyQuestion(row.id, user.id, true)));
        const today = new Date();
        const { getDayRange } = await import("@/lib/date-time");
        const tomorrow = getDayRange(today, state.timeZone, 1).start;
        await releaseDeferredChecks(user.id, new Date(tomorrow.getTime() - 1));
        expect((await Promise.all(rows.map(row => issues(row.id)))).filter(row => visibleCheckIssues(row).length)).toHaveLength(3);
        await releaseDeferredChecks(user.id, tomorrow);
        await releaseDeferredChecks(user.id, tomorrow);
        expect((await Promise.all(rows.map(row => issues(row.id)))).filter(row => visibleCheckIssues(row).length)).toHaveLength(6);
        await releaseDeferredChecks(user.id, getDayRange(today, state.timeZone, 20).start);
        expect((await Promise.all(rows.map(row => issues(row.id)))).filter(row => visibleCheckIssues(row).length)).toHaveLength(9);
    });
    it("规则通过的带图存量题随后由 AI 新发现的问题也受额度限制", async () => {
        for (let i = 0; i < 3; i++) { const row = await item(); await checkLegacyQuestion(row.id, user.id, true); }
        const row = await item("普通题"); await checkLegacyQuestion(row.id, user.id, true);
        await runSerializedTransaction(async tx => {
            const current = await tx.errorItem.findUniqueOrThrow({ where: { id: row.id } });
            const data = mergeAiCheckIssues(current.checkIssues, [{ code: "image_mismatch", field: "originalImageUrl", visibility: "user", severity: "major" }], "mock");
            data.checkIssues = await surfaceLegacyIssues(tx, user.id, data.checkIssues);
            await tx.errorItem.update({ where: { id: row.id }, data });
        });
        expect((await stored(row.id)).checkStatus).toBe("flagged");
        expect(checkContext(await issues(row.id))?.deferredUntil).toBeDefined();
        expect(visibleCheckIssues(await issues(row.id))).toEqual([]);
    });
    it("检查失败也不使已保存的复习返回失败", async () => {
        const row = await item();
        vi.spyOn(state.client, "$transaction").mockImplementationOnce(async fn => {
            if (typeof fn !== "function") throw new Error("测试期望交互事务");
            return fn(state.client);
        }).mockRejectedValueOnce(new Error("检查数据库暂不可用"));
        const response = await submit(new Request("http://localhost/api/practice/record", { method: "POST", body: JSON.stringify({ errorItemId: row.id, source: "review", result: "correct" }) }));
        expect(response.status).toBe(200);
        expect(await state.client.practiceRecord.count()).toBe(1);
    });
    it("维护脚本默认规则检查，按用户、来源与数量筛选；重复运行跳过当前版本", async () => {
        const first = await item();
        const second = await item();
        await state.client.errorItem.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { source: "历史试卷/第一份" } });
        const untouched = await item();
        const other = await state.client.user.create({ data: { email: "script-other@example.test", password: "test" } });
        const otherItem = await item("如图求解", other.id);
        const databases = await state.client.$queryRaw<Array<{ file: string }>>`PRAGMA database_list`;
        const env = { ...process.env, DATABASE_URL: `file:${databases[0].file}`, CONFIG_DIR: process.env.IMAGE_STORAGE_DIR };
        const args = ["--conditions=react-server", "scripts/backfill-question-integrity.cjs", "--user", user.email, "--source-prefix", "历史试卷/", "--limit", "1", "--interval-ms", "100"];
        const result = await promisify(execFile)(process.execPath, args, { env, timeout: 30000 });
        expect(JSON.parse(result.stdout.trim().split("\n").at(-1)!)).toMatchObject({ selected: 1, checked: 1, flagged: 1, rulesOnly: true });
        expect((await stored(untouched.id)).checkedAt).toBeNull();
        expect((await stored(otherItem.id)).checkedAt).toBeNull();
        expect(await state.client.aiUsage.count()).toBe(0);
        await promisify(execFile)(process.execPath, args, { env, timeout: 30000 });
        const final = await promisify(execFile)(process.execPath, args, { env, timeout: 30000 });
        expect(JSON.parse(final.stdout.trim().split("\n").at(-1)!)).toMatchObject({ selected: 0, checked: 0 });
    }, 90000);
    it("只读统计仅管理员可访问且不触发检查或写入", async () => {
        expect((await stats(new Request("http://localhost/api/admin/question-integrity"))).status).toBe(403);
        await state.client.user.update({ where: { id: user.id }, data: { role: "admin" } });
        const row = await item(); await checkSavedQuestion(row.id);
        const before = await stored(row.id);
        const response = await stats(new Request("http://localhost/api/admin/question-integrity"));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ imports: 1, flaggedImports: 1, flaggedImportRate: 1, timedActions: 0, averageHandlingMs: null });
        expect(await stored(row.id)).toEqual(before);
        expect(scheduleIntegrityCheck).not.toHaveBeenCalled();
    });
});
