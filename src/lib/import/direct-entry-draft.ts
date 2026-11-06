import { z } from "zod";

export const directEntryDraftSchema = z.object({
    questionText: z.string(), answerText: z.string(), analysis: z.string(),
    wrongAnswerText: z.string(), mistakeAnalysis: z.string(),
    mistakeStatus: z.enum(["unknown", "wrong_attempt", "not_attempted"]),
    knowledgePoints: z.array(z.string()), subjectId: z.string(),
    gradeSemester: z.string(), paperLevel: z.string(),
});

export type DirectEntryDraft = z.infer<typeof directEntryDraftSchema>;
export const EMPTY_DIRECT_ENTRY: DirectEntryDraft = {
    questionText: "", answerText: "", analysis: "", wrongAnswerText: "", mistakeAnalysis: "",
    mistakeStatus: "unknown", knowledgePoints: [], subjectId: "", gradeSemester: "", paperLevel: "",
};
