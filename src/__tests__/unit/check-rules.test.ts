import { describe, expect, it } from "vitest";
import { CHECK_VERSION, checkQuestionRules } from "@/lib/question/check-rules";
import type { QuestionCheckInput } from "@/lib/question/check-rules";

const codes = (input: QuestionCheckInput) => checkQuestionRules({ answerText: "答案", ...input }).map((issue) => issue.code);

describe("题目规则检查（宁可漏报）", () => {
    it("使用第一版规则", () => expect(CHECK_VERSION).toBe(1));
    it.each(["如图", "下图", "图中", "右图", "左图", "上图"])("%s 无任何图时才提醒用户", (reference) => {
        expect(checkQuestionRules({ questionText: `${reference}，求面积`, hasFigure: true })).toContainEqual({
            code: "missing_figure", severity: "minor", visibility: "user", field: "questionText", evidence: reference,
        });
    });
    it.each([{ figureSvg: "<svg />" }, { originalImageUrl: "local-image:abc" }])("有图时不误报：%j", (image) => {
        expect(codes({ questionText: "如图求面积", ...image })).not.toContain("missing_figure");
    });
    it("英文与普通文字不猜测为缺图，hasFigure 标记本身也不触发", () => {
        expect(codes({ questionText: "Find the area of a square.", hasFigure: true })).not.toContain("missing_figure");
    });
    it("只把缺图展示给用户，空答案仅给代理", () => {
        expect(checkQuestionRules({ questionText: "计算", answerText: "  " })).toEqual([
            { code: "missing_answer", field: "answerText", severity: "minor", visibility: "agent" },
        ]);
        expect(codes({ answerText: "0" })).not.toContain("missing_answer");
    });
    it.each(["single_choice", "multiple_choice", "选择题"])("检查选择题 %s 缺选项", (questionType) => {
        expect(codes({ questionType, questionText: "选择正确答案" })).toContain("missing_options");
        expect(codes({ questionType, questionText: "选择 A.一 C.三" })).toContain("missing_options");
    });
    it.each(["Ａ．一 Ｂ．二 Ｃ．三", "A、一 B、二 C、三", "A) one\nB) two\nC) three", "A：甲 B：乙 C：丙", "Choose: A. Yes B. No", "a. one b. two c. three"])("识别不同选项格式：%s", (questionText) => {
        expect(codes({ questionType: "single_choice", questionText })).not.toContain("missing_options");
    });
    it("判断题和英文开放题不检查选项", () => {
        expect(codes({ questionType: "true_false", questionText: "判断正误" })).not.toContain("missing_options");
        expect(codes({ questionText: "Explain your answer in English." })).not.toContain("missing_options");
    });
    it("填空题没有空位时仅记录后台问题", () => {
        expect(codes({ questionType: "fill_blank", questionText: "填写答案" })).toContain("missing_blank");
    });
    it.each(["x = ____", "kě（　）求", "Fill in ( ) please", "填（\n ）", "x = ＿＿", "$x=\\underline{\\qquad}$"])("识别空位 %s", (questionText) => {
        expect(codes({ questionType: "fill_blank", questionText })).not.toContain("missing_blank");
    });
    it("非填空题不检查空位", () => expect(codes({ questionText: "Explain why", questionType: "writing" })).not.toContain("missing_blank"));
    it("仅当两边都是明确连续括号编号时检查小问数", () => {
        expect(codes({ questionText: "(1)求值；(2)证明", answerText: "（1）3" })).toContain("subquestion_count_mismatch");
    });
    it.each(["①3 ②证明略", "3；证明略", "(1)3 (2)证明略", "（一）3（二）略", "(2)证明略"])("答案格式不确定或一致时不报小问缺失：%s", (answerText) => {
        expect(codes({ questionText: "（1）求值（2）证明", answerText })).not.toContain("subquestion_count_mismatch");
    });
    it("算式中的括号数字不当作小问", () => {
        expect(codes({ questionText: "计算 (1)+(2)", answerText: "(1)" })).not.toContain("subquestion_count_mismatch");
    });
    it("批次连续编号的跳号仅给后台", () => {
        expect(codes({ batchQuestionNumbers: [1, 2, 4] })).toContain("question_number_gap");
        for (const numbers of [undefined, [], [3], [3, 2, 2, 1], [1, 1.5, 4]]) {
            expect(codes({ batchQuestionNumbers: numbers })).not.toContain("question_number_gap");
        }
    });
    it("复用公式检查，合法公式和英文不误报", () => {
        expect(codes({ questionText: "$\\frac{1}$" })).toContain("latex_syntax");
        expect(codes({ answerText: "$\\unknowncommand{x}$" })).toContain("latex_syntax");
        expect(codes({ questionText: "Solve $x^{2}=4$", answerText: "$x=\\pm 2$" })).not.toContain("latex_syntax");
        expect(codes({ questionText: "What is your name?" })).not.toContain("latex_syntax");
    });
    it.each(["image", "pdf", "upload"])("%s 来源没有出处页只记后台", (sourceType) => {
        expect(codes({ sourceType })).toContain("missing_source_page");
        expect(codes({ sourceType, hasSourcePage: true })).not.toContain("missing_source_page");
    });
    it("纯文字和未知来源不要求出处页", () => {
        expect(codes({ sourceType: "text" })).not.toContain("missing_source_page");
        expect(codes({})).not.toContain("missing_source_page");
    });
});
