import { describe, expect, it } from "vitest";
import { parseIntegrityBackfillOptions, runRateLimited } from "@/lib/question/backfill-options";
import { calculateIntegrityStats } from "@/lib/question/integrity-stats";
import { checkContext, mergeCheckMetadata, withCheckContext } from "@/lib/question/check-metadata";
import { parseSurfaceLedger } from "@/lib/question/surface-ledger";

describe("存量脚本参数与限速", () => {
    it("默认只检查规则，支持用户、来源、数量与显式 AI", () => {
        expect(parseIntegrityBackfillOptions([])).toEqual({ limit: 100, intervalMs: 1000, rulesOnly: true });
        expect(parseIntegrityBackfillOptions(["--user", "a@example.test", "--source-prefix", "试卷", "--limit", "12", "--interval-ms", "200", "--ai"]))
            .toEqual({ user: "a@example.test", sourcePrefix: "试卷", limit: 12, intervalMs: 200, rulesOnly: false });
        expect(parseIntegrityBackfillOptions(["--rules-only"]).rulesOnly).toBe(true);
    });
    it.each([["--unknown"], ["--user"], ["--limit", "0"], ["--limit", "1.2"], ["--limit", "10001"], ["--interval-ms", "99"], ["--interval-ms", "60001"], ["--ai", "--rules-only"], ["--limit", "2", "--limit", "3"]].map(args => ({ args })))("拒绝非法参数 $args", ({ args }) => {
        expect(() => parseIntegrityBackfillOptions(args)).toThrow();
    });
    it("上一题完成后才等待规定间隔，不并发、不在末尾多等", async () => {
        const events: string[] = [];
        await runRateLimited([1, 2, 3], 500, async row => { events.push(`开始${row}`); await Promise.resolve(); events.push(`完成${row}`); }, async ms => { events.push(`等待${ms}`); });
        expect(events).toEqual(["开始1", "完成1", "等待500", "开始2", "完成2", "等待500", "开始3", "完成3"]);
    });
    it("账本拒绝损坏与越界值", () => {
        expect(parseSurfaceLedger('{"day":"2026-11-10","count":3}')).toEqual({ day: "2026-11-10", count: 3 });
        for (const raw of [null, "{", "[]", '{"day":"bad","count":1}', '{"day":"2026-11-10","count":4}']) expect(parseSurfaceLedger(raw)).toBeNull();
    });
});

describe("核对观察统计", () => {
    it("已处理完的存量题再次出现新问题时重新等待展示额度", () => {
        const previous = withCheckContext([{ code: "missing_figure", field: "questionText", source: "rules", visibility: "user", severity: "minor", dismissed: true }], {
            origin: "legacy", observedAt: "2026-11-01T00:00:00.000Z", surfacedAt: "2026-11-01T00:00:00.000Z",
        });
        const merged = mergeCheckMetadata(previous, [...previous, { code: "image_mismatch", field: "image", source: "ai", visibility: "user", severity: "major" }]);
        expect(checkContext(merged)).toMatchObject({ origin: "legacy" });
        expect(checkContext(merged)?.surfacedAt).toBeUndefined();
    });
    it("按新导入题而非问题数计算比例，按问题类型计算误报率，忽略无计时历史", () => {
        const at = "2026-11-10T01:00:00.000Z";
        const row = (origin: "import" | "legacy", importIssueCodes: string[], handling: Array<{ code: string; action: string; at: string; durationMs?: number }> = []) => ({ createdAt: new Date(at), checkIssues: JSON.stringify(withCheckContext([], { origin, observedAt: at, importIssueCodes, handling })) });
        const result = calculateIntegrityStats([
            row("import", ["text_diff", "missing_figure"], [{ code: "text_diff", action: "dismiss", at, durationMs: 5000 }, { code: "text_diff", action: "accept", at, durationMs: 9000 }]),
            row("import", []), row("legacy", [], [{ code: "missing_figure", action: "dismiss", at }]),
            row("legacy", [], [{ code: "missing_figure", action: "dismiss", at: "2026-11-09T00:00:00.000Z", durationMs: 100 }]),
            { createdAt: new Date(at), checkIssues: "[]" },
        ], new Date("2026-11-10"), new Date("2026-11-11"));
        expect(result).toEqual({ imports: 2, flaggedImports: 1, flaggedImportRate: 0.5, timedActions: 2, timedQuestions: 1, averageHandlingMs: 14000,
            byType: { text_diff: { handled: 2, dismissed: 1, dismissRate: 0.5 }, missing_figure: { handled: 1, dismissed: 1, dismissRate: 1 } } });
        expect(calculateIntegrityStats([], new Date(), new Date())).toMatchObject({ flaggedImportRate: null, averageHandlingMs: null });
    });
});
