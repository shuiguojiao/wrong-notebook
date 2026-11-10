import { z } from "zod";
import { answerImageSchema } from "@/lib/handwriting/image";

export const attemptKindSchema = z.enum(['online', 'photo', 'manual']);
export const finalResultSchema = z.enum(['correct', 'wrong', 'not_attempted']);
export const durationSchema = z.number().int().min(0).max(2147483647);
export const saveAnswerSchema = z.object({
    answerText: z.string().max(20000).nullable().optional(),
    answerImage: answerImageSchema.nullable().optional(),
    answerImages: z.array(answerImageSchema).max(4).nullable().optional(),
    flagged: z.boolean().optional(),
    durationSec: durationSchema.optional(),
}).strict();
export const submitAttemptSchema = z.object({ durationSec: durationSchema.optional() }).strict();
export const confirmAttemptSchema = z.object({ takenAt: z.string().datetime({ offset: true }).optional() }).strict();
/** 手动补录只接受已经发生的时间；非手动方式不使用此字段。 */
export const manualTakenAtSchema = z.string().datetime({ offset: true }).refine(value => new Date(value).getTime() <= Date.now(), '考试日期不能晚于今天');
export type ConfirmAttemptInput = z.infer<typeof confirmAttemptSchema>;
export type AttemptKind = z.infer<typeof attemptKindSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
export type FinalResult = z.infer<typeof finalResultSchema>;
