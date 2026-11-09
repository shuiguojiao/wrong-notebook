import { findLatexIssues } from "@/lib/latex-check";
import { normalizeQuestionType } from "@/lib/question/question-type";

/** 规则发生变化时递增，供后续按需重检使用。 */
export const CHECK_VERSION = 1;

export interface CheckIssue {
    code: string;
    severity: "major" | "minor";
    visibility: "user" | "agent";
    field: string;
    message?: string;
    evidence?: string;
}

export interface QuestionCheckInput {
    questionText?: string | null;
    answerText?: string | null;
    questionType?: string | null;
    hasFigure?: boolean;
    figureSvg?: string | null;
    originalImageUrl?: string | null;
    hasSourcePage?: boolean;
    sourceType?: string | null;
    /** 仅传同页、同一编号序列且确认应连续的题号；筛选收录的题不要传入。 */
    batchQuestionNumbers?: readonly number[];
}

function subquestions(text: string): number[] | null {
    // 不猜测圆圈数字、罗马数字等编号与括号数字之间的对应关系。
    if (/[①-⑳]|[（(]\s*[一二三四五六七八九十ivx]+\s*[）)]/i.test(text)) return null;
    const normalized = text.normalize("NFKC");
    const markers = [...normalized.matchAll(/\((\d{1,2})\)/g)];
    // 算式里的 (1)+(2) 不是小问编号；编号后没有正文也不强行判定。
    if (markers.some((match) => !/^[\s]*[^\s+−×÷=<>.,;:!?，。；：！？)\]}-]/.test(normalized.slice(match.index + match[0].length)))) return null;
    const numbers = markers.map((match) => Number(match[1]));
    return numbers.length && numbers.every((number, index) => number === index + 1) ? numbers : null;
}

/** 无网络与数据库依赖；只报告有把握的问题，未知格式宁可跳过。 */
export function checkQuestionRules(input: QuestionCheckInput): CheckIssue[] {
    const issues: CheckIssue[] = [];
    const question = input.questionText?.trim() ?? "";
    const answer = input.answerText?.trim() ?? "";
    const add = (code: string, field: string, evidence?: string) => issues.push({
        code, field, severity: "minor" as const, visibility: "agent" as const, ...(evidence ? { evidence } : {}),
    });
    const reference = question.match(/如图|下图|图中|右图|左图|上图/);
    // hasFigure 仅是识别标记，不能证明真的存有图片。
    if (reference && !input.figureSvg?.trim() && !input.originalImageUrl?.trim()) {
        issues.push({ code: "missing_figure", severity: "minor", visibility: "user", field: "questionText", evidence: reference[0] });
    }
    if (!answer) add("missing_answer", "answerText");
    const type = normalizeQuestionType(input.questionType);
    if (question && (type === "single_choice" || type === "multiple_choice")) {
        const text = question.normalize("NFKC");
        const labels = new Set(["A", "B", "C", "D"].filter((letter) => new RegExp(`(?:^|[^A-Za-z])${letter}\\s*[.、:：)）]`, "i").test(text)));
        // 英文等题目可能只有 A/B 两项；不凭缺少 C 就断言选项丢失。
        const expected = labels.has("D") ? ["A", "B", "C", "D"] : labels.has("C") ? ["A", "B", "C"] : ["A", "B"];
        const missing = expected.filter((letter) => !labels.has(letter));
        if (missing.length) add("missing_options", "questionText", missing.join("/"));
    }
    if (question && type === "fill_blank" && !/_{2,}|[＿﹍﹎]{2,}|[（(][\s\u3000]*[）)]|\\(?:underline|underbrace)\s*\{/.test(question)) {
        add("missing_blank", "questionText");
    }
    const questionParts = subquestions(question);
    const answerParts = subquestions(answer);
    // 没有可比较的答案编号时不把自由作答误判成缺小问。
    if (questionParts && questionParts.length >= 2 && answerParts && questionParts.length !== answerParts.length) {
        add("subquestion_count_mismatch", "answerText", `${questionParts.length}/${answerParts.length}`);
    }
    const numbers = input.batchQuestionNumbers;
    if (numbers && numbers.length >= 2 && numbers.every((number) => Number.isSafeInteger(number) && number > 0)) {
        const sorted = [...new Set(numbers)].sort((a, b) => a - b);
        const gaps = sorted.slice(1).flatMap((number, index) => number > sorted[index] + 1 ? [`${sorted[index]}→${number}`] : []);
        if (gaps.length) add("question_number_gap", "batchQuestionNumbers", gaps.join(", "));
    }
    for (const field of ["questionText", "answerText"] as const) {
        const latex = findLatexIssues(input[field]);
        if (latex.length) add("latex_syntax", field, latex.map((issue) => `${issue.snippet}: ${issue.message}`).join("\n"));
    }
    if (["image", "pdf", "upload"].includes(input.sourceType ?? "") && !input.hasSourcePage) {
        add("missing_source_page", "sourcePage");
    }
    return issues;
}
