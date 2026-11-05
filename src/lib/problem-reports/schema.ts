import { z } from "zod";

export const REPORT_CATEGORIES = ["text", "formula", "answer", "analysis", "tags", "figure", "other"] as const;
export const REPORT_STATUSES = ["open", "resolved", "wontfix"] as const;
export const REPORT_DAILY_LIMIT = 30;
export const REPORT_DESCRIPTION_LIMIT = 2000;
export const REPORT_NOTE_LIMIT = 2000;

const snapshotText = z.string().max(100000).nullable();
export const reportSnapshotSchema = z.object({
    questionText: snapshotText,
    answerText: snapshotText,
    analysis: snapshotText,
    knowledgePoints: z.array(z.string().max(1000)).max(500),
    subject: z.string().max(1000).nullable(),
    gradeSemester: z.string().max(1000).nullable(),
    source: z.string().max(2000).nullable(),
    entryMethod: z.enum(["image", "text", "unknown"]),
    hasOriginalImage: z.boolean(),
    aiProvider: z.string().max(500).nullable(),
    aiModel: z.string().max(500).nullable(),
}).strict();
export const createReportSchema = z.object({
    errorItemId: z.string().min(1).max(100),
    category: z.enum(REPORT_CATEGORIES),
    description: z.string().trim().min(1).max(REPORT_DESCRIPTION_LIMIT),
}).strict();
export const updateReportSchema = z.object({
    status: z.enum(REPORT_STATUSES),
    adminNote: z.string().trim().max(REPORT_NOTE_LIMIT),
}).strict();
export const reportFilterSchema = z.object({
    status: z.enum(REPORT_STATUSES).optional(),
    category: z.enum(REPORT_CATEGORIES).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
});
export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;
export interface UserProblemReport {
    id: string;
    category: typeof REPORT_CATEGORIES[number];
    description: string;
    status: typeof REPORT_STATUSES[number];
    adminNote: string;
    createdAt: string;
    updatedAt: string;
}
export interface AdminProblemReport extends UserProblemReport {
    user: { name: string | null; email: string };
    snapshot: ReportSnapshot;
}
