import { z } from 'zod';

export const MAX_EXAM_PAGES = 8;
export const EXAM_ANSWER_NOT_FOUND = 'EXAM_ANSWER_NOT_FOUND';
export const EXAM_ANSWER_UNREADABLE = 'EXAM_ANSWER_UNREADABLE';
export const examRegionSchema = z.object({
    x: z.number().finite(), y: z.number().finite(),
    width: z.number().positive().finite(), height: z.number().positive().finite(),
}).transform(region => {
    const x = Math.max(0, Math.min(0.99, region.x));
    const y = Math.max(0, Math.min(0.99, region.y));
    return { x, y, width: Math.max(0.01, Math.min(1, region.x + region.width) - x), height: Math.max(0.01, Math.min(1, region.y + region.height) - y) };
});
export const examPageLocationSchema = z.object({
    pageReadable: z.boolean(),
    paperCode: z.string().max(40).default(''),
    answers: z.array(z.object({
        number: z.number().int().positive(), region: examRegionSchema,
        transcript: z.string().max(20000).default(''),
        handMark: z.enum(['correct', 'wrong', 'none']).default('none'),
        legible: z.boolean().default(false),
    })).max(200).default([]),
});
export const pageIssuesSchema = z.array(z.union([
    z.object({ index: z.number().int().min(0).max(7), reason: z.enum(['unreadable', 'wrong_paper']) }),
    z.object({ index: z.literal(-1), reason: z.literal('locate_failed') }),
])).max(9);
export type ExamPageIssue = z.infer<typeof pageIssuesSchema>[number];
export const pageLocationsSchema = z.array(z.object({ image: z.string(), result: examPageLocationSchema })).max(8);
export type ExamPageLocation = z.infer<typeof examPageLocationSchema>;
export type ExamRegion = z.infer<typeof examRegionSchema>;
export interface LocateExamAnswersInput {
    image: string;
    paperCode: string;
    questions: { number: number; questionType: string | null; questionText: string }[];
    language?: 'zh' | 'en';
}
export function examPageIssue(page: ExamPageLocation, code: string): 'unreadable' | 'wrong_paper' | null {
    if (!page.pageReadable) return 'unreadable';
    const actual = page.paperCode.trim().toUpperCase();
    const expected = code.trim().toUpperCase();
    if (!actual) return null;
    if (actual.length !== expected.length) return 'wrong_paper';
    const differences = [...actual].filter((character, index) => character !== expected[index]).length;
    return differences > 1 ? 'wrong_paper' : null;
}
export function hasMajorityHandMarks(marks: Array<string | null>, originalCount: number): boolean {
    return originalCount > 0 && marks.filter(mark => mark === 'correct' || mark === 'wrong').length >= originalCount / 2;
}
export function moveExamPage<T>(pages: T[], from: number, to: number): T[] {
    if (from < 0 || to < 0 || from >= pages.length || to >= pages.length) return pages;
    const result = [...pages];
    const [page] = result.splice(from, 1);
    result.splice(to, 0, page);
    return result;
}
