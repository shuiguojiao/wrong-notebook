import { z } from "zod";
import { answerImageSchema } from "@/lib/handwriting/image";

export const attemptKindSchema = z.enum(['online', 'photo', 'manual']);
export const finalResultSchema = z.enum(['correct', 'wrong', 'not_attempted']);
export const durationSchema = z.number().int().min(0).max(2147483647);
export const saveAnswerSchema = z.object({
    answerText: z.string().max(20000).nullable().optional(),
    answerImage: answerImageSchema.nullable().optional(),
    flagged: z.boolean().optional(),
    durationSec: durationSchema.optional(),
}).strict();
export const submitAttemptSchema = z.object({ durationSec: durationSchema.optional() }).strict();
export type AttemptKind = z.infer<typeof attemptKindSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
export type FinalResult = z.infer<typeof finalResultSchema>;
