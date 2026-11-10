import { z } from 'zod';

const dateSchema = z.iso.date();
const subjectId = z.string().trim().min(1).optional();

export const practiceHistoryQuerySchema = z.object({
    before: dateSchema.optional(),
    days: z.coerce.number().int().min(1).max(31).default(7),
    subjectId,
    result: z.literal('wrong').optional(),
    date: dateSchema.optional(),
});

/** 按日历日期计算天数，避免夏令时造成区间长度偏差。 */
export const practiceCalendarQuerySchema = z.object({
    from: dateSchema,
    to: dateSchema,
    subjectId,
}).refine(({ from, to }) => {
    const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    return span >= 0 && span < 62;
});
