import { z } from "zod";

export const MISTAKE_CAUSES = ["concept", "method", "reading", "calculation", "memory"] as const;
export type MistakeCause = (typeof MISTAKE_CAUSES)[number];
export const MISTAKE_LESSON_MAX_LENGTH = 80;

const causeEnum = z.enum(MISTAKE_CAUSES);

export function normalizeMistakeCause(value: unknown): MistakeCause | null {
    const parsed = causeEnum.safeParse(value);
    return parsed.success ? parsed.data : null;
}

/** 未提交的字段保留原值，非法分类和显式清除均存为空。 */
export const mistakeCauseSchema = z.unknown().transform(normalizeMistakeCause).optional();
export const mistakeLessonSchema = z.string().trim().max(MISTAKE_LESSON_MAX_LENGTH)
    .transform(value => value || null).nullish();
