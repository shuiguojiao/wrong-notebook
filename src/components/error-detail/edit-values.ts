import { normalizeMistakeStatusForSave } from "@/lib/question/mistake-status";
import { getItemTags } from "./types";
import type { ErrorItemDetail } from "./types";

/** 使用与接口一致的标量表示，便于比较旧数据和本次修改。 */
export function createEditValues(item: ErrorItemDetail) {
    return {
        questionText: item.questionText,
        answerText: item.answerText ?? "",
        wrongAnswerText: item.wrongAnswerText || "",
        mistakeStatus: item.mistakeStatus || "unknown",
        analysis: item.analysis,
        mistakeAnalysis: item.mistakeAnalysis || "",
        userNotes: item.userNotes || "",
        questionType: item.questionType || "",
        gradeSemester: item.gradeSemester || "",
        subjectId: item.subjectId || "",
        paperLevel: item.paperLevel || "",
        knowledgePoints: JSON.stringify(getItemTags(item)),
        difficultyStars: item.difficultyStars ?? null,
    };
}

export type EditValues = ReturnType<typeof createEditValues>;

export function changedFields(saved: EditValues, draft: EditValues): Partial<ErrorItemDetail> {
    const normalized = { ...draft };
    // 未修改错答时不规范化旧状态，避免无关字段进入请求。
    if (draft.wrongAnswerText !== saved.wrongAnswerText || draft.mistakeStatus !== saved.mistakeStatus) {
        normalized.mistakeStatus = normalizeMistakeStatusForSave(draft.mistakeStatus, draft.wrongAnswerText);
    }
    const changes: Record<string, string | number | null> = {};
    for (const key of Object.keys(saved) as (keyof EditValues)[]) {
        if (normalized[key] !== saved[key]) changes[key] = normalized[key];
    }
    if (changes.paperLevel === "") changes.paperLevel = null;
    if (changes.questionType === "") changes.questionType = null;
    return changes;
}
