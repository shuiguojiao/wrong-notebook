import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkSavedQuestion, mergeRuleCheckIssues, parseCheckIssues, questionCheckResponse } from "@/lib/question/check-store";
import type { StoredCheckIssue } from "@/lib/question/check-store";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), warn: vi.fn() }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ warn: mocks.warn }) }));
vi.mock("@/lib/db-write-queue", () => ({ runSerializedTransaction: (fn: (tx: unknown) => unknown) => fn({ errorItem: mocks }) }));
const rule: StoredCheckIssue = { code: "missing_figure", field: "questionText", severity: "minor", visibility: "user", source: "rules", dismissed: true };
const ai: StoredCheckIssue & { suggestion: string } = { code: "text_mismatch", field: "questionText", severity: "major", visibility: "user", source: "ai", evidence: "原图为 3", suggestion: "改为 3", dismissed: false };
beforeEach(() => { vi.clearAllMocks(); });

describe("规则检查记录", () => {
    it.each([null, undefined, "", "{bad", "{}", "null", '[null,4,{}, {"source":"ai"}]'])("坏 JSON 与坏条目按空处理：%s", (raw) => {
        expect(parseCheckIssues(raw)).toEqual([]);
    });
    it("规则重检保留 AI 原文，按 code+field 保留忽略状态", () => {
        const merged = mergeRuleCheckIssues(JSON.stringify([ai, rule]), [rule]);
        expect(JSON.parse(merged.checkIssues)).toEqual([ai, rule]);
        expect(parseCheckIssues(JSON.stringify([null, ai, {}]))).toEqual([ai]);
        expect(merged).toMatchObject({ checkStatus: "flagged", checkVersion: 1, checkedAt: expect.any(Date) });
        expect(mergeRuleCheckIssues(JSON.stringify([rule]), [rule]).checkStatus).toBe("pass");
        expect(mergeRuleCheckIssues(null, [rule]).checkStatus).toBe("flagged");
        expect(mergeRuleCheckIssues(JSON.stringify([rule]), [{ ...rule, field: "answerText" }]).checkStatus).toBe("flagged");
    });
    it("已经消失的问题仍记住忽略类型，未来复发也不再提醒", () => {
        const disappeared = mergeRuleCheckIssues(JSON.stringify([rule]), []);
        expect(parseCheckIssues(disappeared.checkIssues)).toEqual([rule]);
        expect(mergeRuleCheckIssues(disappeared.checkIssues, [rule]).checkStatus).toBe("pass");
    });
    it("修复后清除未忽略的旧规则问题，后台问题不使状态 flagged", () => {
        const old = JSON.stringify([{ ...rule, dismissed: false }]);
        expect(mergeRuleCheckIssues(old, []).checkStatus).toBe("pass");
        expect(mergeRuleCheckIssues(null, [{ ...rule, visibility: "agent" }]).checkStatus).toBe("pass");
        expect(questionCheckResponse({})).toEqual({ status: "none", issues: [] });
    });
    it("在保存出处之后读取最新题目并写入四个检查字段", async () => {
        mocks.findUnique.mockResolvedValue({ questionText: "如图", answerText: "3", originalImageUrl: "image", questionRegions: [{ page: { origin: "pdf" } }], checkIssues: JSON.stringify([ai]) });
        mocks.update.mockImplementation(async ({ data }) => data);
        const result = await checkSavedQuestion("item");
        expect(result).toMatchObject({ checkStatus: "flagged", checkIssues: JSON.stringify([ai]), checkVersion: 1, checkedAt: expect.any(Date) });
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "item" } }));
    });
    it("缺图题写 flagged，无出处的旧图仅记后台", async () => {
        mocks.update.mockImplementation(async ({ data }) => data);
        mocks.findUnique.mockResolvedValue({ questionText: "如图", answerText: "3", originalImageUrl: "", questionRegions: [] });
        expect(await checkSavedQuestion("item")).toMatchObject({ checkStatus: "flagged" });
        mocks.findUnique.mockResolvedValue({ questionText: "如图", answerText: "3", originalImageUrl: "image", questionRegions: [] });
        const result = await checkSavedQuestion("item");
        expect(result?.checkStatus).toBe("pass");
        expect(parseCheckIssues(result?.checkIssues)).toEqual([expect.objectContaining({ code: "missing_source_page", source: "rules", visibility: "agent" })]);
    });
    it("检查失败只记录日志，题目不存在时不写入", async () => {
        mocks.findUnique.mockRejectedValueOnce(new Error("test-failure"));
        expect(await checkSavedQuestion("item")).toBeNull();
        expect(mocks.warn).toHaveBeenCalled();
        mocks.findUnique.mockResolvedValueOnce(null);
        expect(await checkSavedQuestion("missing")).toBeNull();
        expect(mocks.update).not.toHaveBeenCalled();
    });
});
