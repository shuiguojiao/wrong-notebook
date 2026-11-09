import { describe, expect, it } from "vitest";
import { groupQuestions, questionGroupKey, questionPreviewKeys } from "@/lib/question/question-preview-key";
import { buildQuestionSummary } from "@/lib/question/question-summary";

describe("题目自身内容预览", () => {
    it("语文字音题省略同组说明，保留完整拼音", () => {
        expect(questionPreviewKeys(["根据拼音写出括号里的汉字。\n\nkěn（ ）求", "根据拼音写出括号里的汉字。\n\n花团 jǐn cù（ ）"]))
            .toEqual(["kěn（ ）求", "花团 jǐn cù（ ）"]);
    });
    it("英语填空省略完整的共同说明，不截断共同的单词开头", () => {
        expect(questionPreviewKeys(["Fill in the blanks.\n\nThe cat is __.", "Fill in the blanks.\nThe dog is __."]))
            .toEqual(["The cat is __.", "The dog is __."]);
        expect(questionPreviewKeys(["The cat is __.", "The dog is __."])).toEqual(["The cat is __.", "The dog is __."]);
    });
    it("数学解答保留表达式，具体的共同条件不能省略", () => {
        expect(questionPreviewKeys(["解答下列各题：\n$x+1=2$", "解答下列各题：\n$x+2=3$"]))
            .toEqual(["$x+1=2$", "$x+2=3$"]);
        const conditions = ["根据 $x+y=3$，求出 x。", "根据 $x+y=3$，求出 y。"];
        expect(questionPreviewKeys(conditions)).toEqual(conditions);
    });
    it("只一题、不同说明、空题干、重复完整题目都不误删", () => {
        expect(questionPreviewKeys(["根据拼音写汉字。kěn（ ）求"])).toEqual(["根据拼音写汉字。kěn（ ）求"]);
        expect(questionPreviewKeys([null, undefined, "  "])).toEqual(["", "", ""]);
        const texts = ["计算 1+2。", "计算 1+2。", "选择正确答案。A/B/C"];
        expect(questionPreviewKeys(texts)).toEqual(texts);
    });
    it("混合题型只省略确实重复的说明", () => {
        expect(questionPreviewKeys(["阅读公共材料，完成以下标记的错题。\n第一问", "补写《诫子书》：淫慢则不能励精", "阅读公共材料，完成以下标记的错题。\n第二问"]))
            .toEqual(["第一问", "补写《诫子书》：淫慢则不能励精", "第二问"]);
    });
    it("Markdown、CRLF 和块级公式仍能交给摘要组件正确渲染", () => {
        const previews = questionPreviewKeys(["**解答下列各题：**\r\n\r\n$$\\frac{1}{2}+x=3$$", "**解答下列各题：**\n\n**求值** $x^2$"]);
        expect(previews).toEqual(["$$\\frac{1}{2}+x=3$$", "**求值** $x^2$"]);
        expect(buildQuestionSummary(previews[0], 100)).toEqual([{ type: "math", tex: "\\frac{1}{2}+x=3" }]);
    });
});

describe("当前页按日期和来源分组", () => {
    const timeZone = "Asia/Shanghai";
    it("取来源的全角分隔符之前首段，缺省来源单独成组", () => {
        const createdAt = "2026-11-09T01:00:00Z";
        const groups = groupQuestions([
            { id: "1", createdAt, source: " 语文.pdf｜第1页" },
            { id: "2", createdAt, source: "语文.pdf；第2页" },
            { id: "3", createdAt, source: "数学.pdf" },
            { id: "4", createdAt, source: null },
            { id: "5", createdAt, source: "" },
        ], timeZone);
        expect(groups.map(group => [group.source, group.items.map(item => item.id)]))
            .toEqual([["语文.pdf", ["1", "2"]], ["数学.pdf", ["3"]], ["", ["4", "5"]]]);
    });
    it("应用时区决定日期边界；日期包含年份，不依赖分页外的数据", () => {
        const first = { createdAt: "2026-11-08T16:00:00Z", source: "语文.pdf" };
        const second = { createdAt: "2026-11-09T15:59:59Z", source: "语文.pdf" };
        expect(questionGroupKey(first, timeZone)).toEqual(questionGroupKey(second, timeZone));
        expect(groupQuestions([first, second, { ...first, createdAt: "2026-11-09T16:00:00Z" }], timeZone)).toHaveLength(2);
        expect(questionGroupKey(first, "UTC").date).toBe("2026-11-08");
        expect(questionGroupKey({ ...first, createdAt: "2025-11-08T16:00:00Z" }, timeZone).key).not.toBe(questionGroupKey(first, timeZone).key);
        expect(groupQuestions([], timeZone)).toEqual([]);
        expect(groupQuestions([second], timeZone)[0].items).toEqual([second]);
    });
});
