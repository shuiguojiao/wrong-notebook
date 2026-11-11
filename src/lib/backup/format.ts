import { z } from "zod";
import { pageIssuesSchema, pageLocationsSchema } from '@/lib/exam/exam-photo-schema';
import { parseSurfaceLedger } from "@/lib/question/surface-ledger";
import { draftRegionSchema } from "@/lib/question-split/draft";
import { answerImageSchema } from "@/lib/handwriting/image";
import { REPORT_CATEGORIES, REPORT_STATUSES, reportSnapshotSchema, REPORT_DESCRIPTION_LIMIT, REPORT_NOTE_LIMIT } from "@/lib/problem-reports/schema";
import { REMINDER_CHANNELS, reminderTimeSchema } from "@/lib/reminders/schema";
import type { BackupSpeech } from "@/lib/tts/speech-cache";

/**
 * 备份文件的格式定义，导出与导入共用。
 * AgentToken 属于凭据，明确排除在所有用户及全量备份之外，不改变备份版本。
 * AiUsage 是运维统计，明确排除在用户备份之外；新增 token 字段不改变备份版本。
 * 导出侧写出的结构是导入侧可接受结构的超集；旧版本缺失的字段在类型上标为可选。
 * 日期字段在导出侧为 Prisma 返回的 Date，JSON 序列化后即为 ISO 字符串，
 * 因此类型上同时接受 string 与 Date。
 */

/** 当前备份文件版本号。图片仍使用 data URL；本机文件引用属于内部实现，不改变备份格式。 */
export const BACKUP_VERSION = 19;

/** 第 14 版：报告不携带原图，仅保存经过校验的快照 JSON。 */
export const backupReportSchema = z.object({
    id: z.string().min(1).max(100),
    userId: z.string().min(1).max(100),
    errorItemId: z.string().min(1).max(100).nullable(),
    category: z.enum(REPORT_CATEGORIES),
    description: z.string().trim().min(1).max(REPORT_DESCRIPTION_LIMIT),
    snapshot: z.string().max(500000).transform((raw, ctx) => {
        try { return JSON.stringify(reportSnapshotSchema.parse(JSON.parse(raw))); }
        catch { ctx.addIssue({ code: 'custom', message: 'Invalid report snapshot' }); return z.NEVER; }
    }),
    status: z.enum(REPORT_STATUSES),
    adminNote: z.string().max(REPORT_NOTE_LIMIT),
    createdAt: z.union([z.iso.datetime(), z.date()]),
    updatedAt: z.union([z.iso.datetime(), z.date()]),
}).strict();
export type BackupProblemReport = z.infer<typeof backupReportSchema>;

/** 第 17 版：出处页与位置独立导出，可跨页并由多题共用。 */
const backupIdSchema = z.string().min(1).max(100);
const backupDateSchema = z.union([z.iso.datetime(), z.date()]);
export const backupSourcePageSchema = z.object({
    id: backupIdSchema,
    userId: backupIdSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    // 缺失图片沿用导出留空规则，导入路由统一拒绝本机引用。
    imageUrl: z.string(),
    width: z.number().int().positive().max(2147483647),
    height: z.number().int().positive().max(2147483647),
    origin: z.enum(['upload', 'pdf', 'docx', 'agent']),
    fileName: z.string().nullable(),
    pageNumber: z.number().int().positive().max(2147483647).nullable(),
    createdAt: backupDateSchema,
});
export const backupQuestionRegionSchema = draftRegionSchema.safeExtend({
    id: backupIdSchema,
    errorItemId: backupIdSchema,
    pageId: backupIdSchema,
    order: z.number().int().nonnegative().max(2147483647),
});
export type BackupSourcePage = z.infer<typeof backupSourcePageSchema>;
export type BackupQuestionRegion = z.infer<typeof backupQuestionRegionSchema>;

/** 第 18 版包含试卷作答、判题原图和重判次数。 */
const nullableText = z.string().max(20000).nullable();
const optionalResult = z.enum(['correct', 'wrong', 'not_attempted']).nullable();
const jsonImagesSchema = (max: number) => z.string().transform((raw, ctx) => {
    try { return JSON.stringify(z.array(z.union([answerImageSchema, z.literal('')])).max(max).parse(JSON.parse(raw))); }
    catch { ctx.addIssue({ code: 'custom', message: 'Invalid page images' }); return z.NEVER; }
});
const pageImagesSchema = jsonImagesSchema(8);
const backupAttemptAnswerSchema = z.object({
    id: backupIdSchema, attemptId: backupIdSchema, examQuestionId: backupIdSchema,
    answerText: nullableText,
    answerImageUrl: z.union([answerImageSchema, z.literal('')]).nullable(),
    gradingImages: jsonImagesSchema(4).nullable(),
    gradingRetries: z.number().int().min(0).max(2),
    flagged: z.boolean(),
    pageIndex: z.number().int().min(0).max(7).nullable(),
    region: z.string().refine(raw => { try { const region: unknown = JSON.parse(raw); return typeof region === 'object' && region !== null && !Array.isArray(region); } catch { return false; } }).nullable(),
    recognizedAnswer: nullableText,
    handMark: z.enum(['correct', 'wrong']).nullable(),
    aiResult: z.enum(['correct', 'wrong', 'unknown']).nullable(),
    aiReason: nullableText, finalResult: optionalResult, updatedAt: backupDateSchema,
});
/** JSON 状态按结构校验，解析异常转成输入错误，旧备份缺省为空。 */
function jsonPhotoStateSchema<T>(schema: z.ZodType<T>) {
    return z.string().transform((raw, ctx) => {
        try { return JSON.stringify(schema.parse(JSON.parse(raw))); }
        catch { ctx.addIssue({ code: 'custom', message: 'Invalid exam photo state' }); return z.NEVER; }
    }).nullable().optional();
}
export const backupExamAttemptSchema = z.object({
    id: backupIdSchema, userId: backupIdSchema, paperId: backupIdSchema,
    kind: z.enum(['online', 'photo', 'manual']), status: z.enum(['answering', 'grading', 'reviewing', 'done']),
    startedAt: backupDateSchema, submittedAt: backupDateSchema.nullable(), confirmedAt: backupDateSchema.nullable(),
    durationSec: z.number().int().min(0).max(2147483647).nullable(), pageImages: pageImagesSchema.nullable(),
    pageIssues: jsonPhotoStateSchema(pageIssuesSchema),
    pageLocations: jsonPhotoStateSchema(pageLocationsSchema.refine(pages => pages.every(page => answerImageSchema.safeParse(page.image).success))),
    createdAt: backupDateSchema, updatedAt: backupDateSchema,
    answers: z.array(backupAttemptAnswerSchema),
});
export interface BackupExamAttemptAnswer extends Omit<z.infer<typeof backupAttemptAnswerSchema>, 'handMark' | 'aiResult' | 'finalResult'> {
    handMark: string | null;
    aiResult: string | null;
    finalResult: string | null;
}
export interface BackupExamAttempt extends Omit<z.infer<typeof backupExamAttemptSchema>, 'kind' | 'status' | 'answers'> {
    kind: string;
    status: string;
    answers: BackupExamAttemptAnswer[];
}

/** 备份文件中的用户对象 */
export interface BackupUser {
    id: string;
    email: string;
    name: string | null;
    educationStage: string | null;
    enrollmentYear: number | null;
    role: string;
    /** version 2 起导出 */
    confirmBeforeImport?: boolean;
    gradeRecognitionMode?: string;
    fixedGradeSemester?: string | null;
    questionDuplicateThreshold?: number;
    masteryThreshold?: number;
    reviewDailyMinutes?: number;
    enableGeogebra?: boolean;
    enableSvgAnimation?: boolean;
    themePreference?: string;
    /** version 13：包含推送凭据，请妥善保管备份。发送账本不随导入重置。 */
    reminderEnabled?: boolean;
    reminderChannel?: string | null;
    reminderCredential?: string | null;
    reminderTime?: string;
    reminderLastSentAt?: string | Date | null;
    reminderLastResult?: string | null;
    /** v17 可选扩展：恢复同日账本不降低已有展示计数。 */
    integritySurfaceLedger?: string | null;
}

/** 备份文件中的学科 */
export interface BackupSubject {
    id: string;
    name: string;
    /** 旧版导出文件没有 */
    stage?: string | null;
    /** 旧版导出文件没有 */
    subjectKey?: string | null;
    /** 旧版导出文件没有，缺省 default */
    tagSet?: string;
    userId: string;
    createdAt: string | Date;
    updatedAt: string | Date;
}

/** 备份文件中的系统标签（version 3 起导出） */
export interface BackupSystemTag {
    id: string;
    name: string;
    subject: string;
    parentId: string | null;
    order: number;
    code: string | null;
    isSystem: boolean;
    tagSet: string;
    createdAt: string | Date;
    updatedAt: string | Date;
}

/** 备份文件中的自定义标签 */
export interface BackupCustomTag {
    id: string;
    name: string;
    subject: string;
    parentId: string | null;
    order: number;
    code: string | null;
    isSystem: boolean;
    /** 旧版导出文件没有，缺省 default */
    tagSet?: string;
    userId: string | null;
    createdAt: string | Date;
    updatedAt: string | Date;
}

/** 备份文件中的错题标签引用 */
export interface BackupErrorItemTag {
    id: string;
    name: string;
    subject: string;
}

/** 备份文件中的错题 */
export interface BackupErrorItem {
    /** version 17：旧版缺省为未检查。 */
    checkStatus?: string | null;
    checkIssues?: string | null;
    checkedAt?: string | Date | null;
    checkVersion?: number | null;
    /** version 16：缓存可重算；手动调整必须保留。 */
    reviewStage?: number;
    reviewWrongStreak?: number;
    nextReviewAt?: string | Date | null;
    reviewCompletedAt?: string | Date | null;
    reviewSyncedAt?: string | Date | null;
    reviewOverride?: string | null;
    reviewOverrideAt?: string | Date | null;
    id: string;
    /** 旧版导出文件没有 */
    shortId?: string | null;
    userId: string;
    subjectId: string | null;
    originalImageUrl: string;
    ocrText: string | null;
    questionText: string | null;
    answerText: string | null;
    analysis: string | null;
    wrongAnswerText: string | null;
    mistakeAnalysis: string | null;
    mistakeStatus: string | null;
    knowledgePoints: string | null;
    source: string | null;
    errorType: string | null;
    userNotes: string | null;
    masteryLevel: number;
    gradeSemester: string | null;
    paperLevel: string | null;
    /** 旧版导出文件没有该字段 */
    difficultyStars?: number | null;
    /** 旧版导出文件没有该字段 */
    hasFigure?: boolean;
    /** 旧版导出文件没有该字段 */
    figureSvg?: string | null;
    /** 旧版备份缺省为 100% */
    figureScale?: number;
    /** 旧版备份缺省为居中 */
    figureAlign?: string;
    /** version 4 起导出，旧版备份缺省为按全局留白档位 */
    answerSpacePx?: number | null;
    /** version 9 起导出，旧版备份缺省为 null */
    questionType?: string | null;
    /** 以下字段 version 2 起导出 */
    geogebraCommands?: string | null;
    svgAnimation?: string | null;
    svgAnimationEn?: string | null;
    lastPractice?: string | null;
    masteryProbability?: number | null;
    masteryReason?: string | null;
    masterySource?: string | null;
    masteryEvaluatedAt?: string | Date | null;
    createdAt: string | Date;
    updatedAt: string | Date;
    tags: BackupErrorItemTag[];
}

/** 备份文件中的复习计划 */
export interface BackupReviewSchedule {
    id: string;
    errorItemId: string;
    scheduledFor: string | Date;
    completedAt: string | Date | null;
    isCorrect: boolean | null;
    createdAt: string | Date;
}

/** 备份文件中的练习记录 */
export interface BackupPracticeRecord {
    /** version 16：缺省按不太确定重放。 */
    confidence?: string | null;
    durationSec?: number | null;
    id: string;
    userId: string;
    subject: string | null;
    difficulty: string | null;
    isCorrect: boolean | null;
    errorItemId?: string | null;
    result?: string | null;
    questionText?: string | null;
    answerText?: string | null;
    analysis?: string | null;
    wrongAnswerText?: string | null;
    /** version 12 起导出，旧版缺省 null */
    notes?: string | null;
    gradeReason?: string | null;
    mistakeAnalysis?: string | null;
    originalImageUrl?: string | null;
    /** version 15 起导出，旧版缺省 null */
    answerImageUrl?: string | null;
    recognizedAnswer?: string | null;
    figureSvg?: string | null;
    /** 包含原题复习 review；沿用字符串字段，无需提升备份版本。 */
    source?: string;
    examQuestionId?: string | null;
    examAttemptId?: string | null;
    createdAt: string | Date;
}

/** 备份文件中的试卷题目 */
export interface BackupExamQuestion {
    id: string;
    order: number;
    errorItemId: string | null;
    sourceShortId: string;
    status: string;
    questionText: string | null;
    answerText: string | null;
    analysis: string | null;
    figureSvg: string | null;
    /** 旧版备份缺省为 100% */
    figureScale?: number;
    /** 旧版备份缺省为居中 */
    figureAlign?: string;
    /** version 4 起导出，旧版备份缺省为按全局留白档位 */
    answerSpacePx?: number | null;
    /** version 10 起导出，旧版备份缺省为未设分值 */
    score?: number | null;
    /** version 11 起导出，旧版备份缺省为 null（分组时回退读取关联错题当前题型） */
    questionType?: string | null;
    error: string | null;
}

/** 备份文件中的试卷（version 2 起导出） */
export interface BackupExamPaper {
    id: string;
    userId: string;
    title: string;
    status: string;
    scope: string;
    difficulty: string;
    /** version 8 起导出，旧版缺省 generate */
    mode?: string;
    /** version 11 起导出，旧版缺省 false（不按题型分大题） */
    groupByType?: boolean;
    requestedCount: number;
    subjectIds: string;
    tagNames: string | null;
    resultsRecordedAt: string | Date | null;
    createdAt: string | Date;
    updatedAt: string | Date;
    questions: BackupExamQuestion[];
}

/** 卷别分组（version 3 起导出） */
export interface BackupPaperGroup {
    id: string;
    userId: string;
    key: string | null;
    name: string;
    order: number;
    isActive: boolean;
    createdAt: string | Date;
    updatedAt: string | Date;
}

/** fork 扩展数据（version 7 起导出） */
export interface BackupExtensionEntry {
    version: number;
    data: unknown;
}

/** 备份文件的顶层结构：导出侧写出的结构 */
export interface BackupFile {
    /** 跳过的缺失或损坏图片字段数；可选元信息，不改变备份版本。 */
    missingImages?: number;
    version: number;
    exportedAt: string;
    scope: string;
    user: BackupUser;
    subjects: BackupSubject[];
    systemTags: BackupSystemTag[];
    customTags: BackupCustomTag[];
    errorItems: BackupErrorItem[];
    reviewSchedules: BackupReviewSchedule[];
    practiceRecords: BackupPracticeRecord[];
    sourcePages?: BackupSourcePage[];
    questionRegions?: BackupQuestionRegion[];
    problemReports?: BackupProblemReport[];
    examPapers: BackupExamPaper[];
    examAttempts?: BackupExamAttempt[];
    paperGroups: BackupPaperGroup[];
    /** 动画讲解的云端语音 */
    ttsSpeeches: BackupSpeech[];
    /** 未处理的识别导入任务（version 5 起导出） */
    importTasks: unknown[];
    /** 未完成的多题批次（version 6 起导出） */
    importBatches: unknown[];
    /** fork 扩展数据（version 7 起导出） */
    extensions: Record<string, BackupExtensionEntry>;
}

/** 导入侧日期类型：JSON 解析后总是字符串 */
type ImportedDate = string;

/** 导入侧的学科：日期字段为字符串 */
export type ImportedBackupSubject = Omit<BackupSubject, "createdAt" | "updatedAt"> & {
    createdAt: ImportedDate;
    updatedAt: ImportedDate;
};

/** 导入侧的系统标签 */
export type ImportedBackupSystemTag = Omit<BackupSystemTag, "createdAt" | "updatedAt"> & {
    createdAt: ImportedDate;
    updatedAt: ImportedDate;
};

/** 导入侧的自定义标签 */
export type ImportedBackupCustomTag = Omit<BackupCustomTag, "createdAt" | "updatedAt"> & {
    createdAt: ImportedDate;
    updatedAt: ImportedDate;
};

/** 导入侧的错题 */
export type ImportedBackupErrorItem = Omit<BackupErrorItem, "masteryEvaluatedAt" | "createdAt" | "updatedAt"> & {
    masteryEvaluatedAt?: ImportedDate | null;
    createdAt: ImportedDate;
    updatedAt: ImportedDate;
};

/** 导入侧的复习计划 */
export type ImportedBackupReviewSchedule = Omit<BackupReviewSchedule, "scheduledFor" | "completedAt" | "createdAt"> & {
    scheduledFor: ImportedDate;
    completedAt: ImportedDate | null;
    createdAt: ImportedDate;
};

/** 导入侧的练习记录 */
export type ImportedBackupPracticeRecord = Omit<BackupPracticeRecord, "createdAt"> & {
    createdAt: ImportedDate;
};

/** 导入侧的试卷 */
export type ImportedBackupExamPaper = Omit<BackupExamPaper, "resultsRecordedAt" | "createdAt" | "updatedAt"> & {
    resultsRecordedAt: ImportedDate | null;
    createdAt: ImportedDate;
    updatedAt: ImportedDate;
};

/** 导入侧的卷别分组 */
export type ImportedBackupPaperGroup = Omit<BackupPaperGroup, "createdAt" | "updatedAt"> & {
    createdAt: ImportedDate;
    updatedAt: ImportedDate;
};

/**
 * 导入侧可接受的备份结构。旧版本缺失的顶层字段标为可选，
 * 日期字段在导入侧为字符串（JSON 解析结果），避免拒绝旧版本备份。
 */
export interface ImportableBackupFile {
    /** 仅供提示，导入时不影响数据恢复；旧备份没有此字段。 */
    missingImages?: number;
    version: number;
    /** 旧版导出文件可能没有 */
    exportedAt?: string;
    scope?: string;
    user: BackupUser;
    subjects?: ImportedBackupSubject[];
    systemTags?: ImportedBackupSystemTag[];
    customTags?: ImportedBackupCustomTag[];
    errorItems: ImportedBackupErrorItem[];
    reviewSchedules?: ImportedBackupReviewSchedule[];
    practiceRecords?: ImportedBackupPracticeRecord[];
    sourcePages?: BackupSourcePage[];
    questionRegions?: BackupQuestionRegion[];
    problemReports?: BackupProblemReport[];
    examPapers?: ImportedBackupExamPaper[];
    examAttempts?: BackupExamAttempt[];
    paperGroups?: ImportedBackupPaperGroup[];
    ttsSpeeches?: unknown;
    importTasks?: unknown;
    importBatches?: unknown;
    extensions?: unknown;
    /** 允许未知顶层字段（未来版本扩展） */
    [key: string]: unknown;
}

/** 宽松的顶层 schema：version 为数字、user 为对象、errorItems 为数组，其余可选并允许未知字段 */
const backupFileSchema = z.object({
    version: z.number(),
    missingImages: z.number().int().nonnegative().optional(),
    user: z.object({
        integritySurfaceLedger: z.string().max(128).refine(raw => parseSurfaceLedger(raw) !== null, { message: "存量展示账本无效" }).nullable().optional(),
        reviewDailyMinutes: z.number().int().min(10).max(180).multipleOf(5).optional(),
        reminderEnabled: z.boolean().optional(),
        reminderChannel: z.enum(REMINDER_CHANNELS).nullable().optional(),
        reminderCredential: z.string().min(1).max(2048).nullable().optional(),
        reminderTime: reminderTimeSchema.optional(),
        reminderLastSentAt: z.union([z.iso.datetime(), z.date()]).nullable().optional(),
        reminderLastResult: z.enum(['accepted', 'failed', 'no_due']).nullable().optional(),
    }).passthrough(),
    sourcePages: z.array(backupSourcePageSchema).optional(),
    questionRegions: z.array(backupQuestionRegionSchema).optional(),
    errorItems: z.array(z.object({
        checkStatus: z.enum(['none', 'pass', 'flagged', 'dismissed', 'resolved']).nullable().optional(),
        checkIssues: z.string().refine((raw) => {
            try { return Array.isArray(JSON.parse(raw)); } catch { return false; }
        }, { message: '检查问题必须为 JSON 数组' }).nullable().optional(),
        checkedAt: backupDateSchema.nullable().optional(),
        checkVersion: z.number().int().nonnegative().max(2147483647).nullable().optional(),
        reviewStage: z.number().int().min(0).max(5).optional(),
        reviewWrongStreak: z.number().int().nonnegative().optional(),
        nextReviewAt: z.union([z.iso.datetime(), z.date()]).nullable().optional(),
        reviewCompletedAt: z.union([z.iso.datetime(), z.date()]).nullable().optional(),
        reviewSyncedAt: z.union([z.iso.datetime(), z.date()]).nullable().optional(),
        reviewOverride: z.enum(['completed', 'restart']).nullable().optional(),
        reviewOverrideAt: z.union([z.iso.datetime(), z.date()]).nullable().optional(),
    }).passthrough().superRefine((item, ctx) => {
        if (Boolean(item.reviewOverride) !== Boolean(item.reviewOverrideAt)) {
            ctx.addIssue({ code: 'custom', path: ['reviewOverrideAt'], message: '手动复习调整与时间必须同时提供' });
        }
    })),
    problemReports: z.array(backupReportSchema).optional(),
    examAttempts: z.array(backupExamAttemptSchema).optional(),
    practiceRecords: z.array(z.object({
        examAttemptId: backupIdSchema.nullable().optional(),
        durationSec: z.number().int().min(0).max(2147483647).nullable().optional(),
        confidence: z.enum(['sure', 'unsure']).nullable().optional(),
        answerImageUrl: z.union([answerImageSchema, z.literal("")]).nullable().optional(),
        recognizedAnswer: z.string().max(20000).nullable().optional(),
    }).passthrough()).optional(),
}).passthrough().superRefine((data, ctx) => {
    const attempts = data.examAttempts ?? [];
    const paperRefs = z.array(z.object({ id: backupIdSchema, userId: backupIdSchema, questions: z.array(z.object({ id: backupIdSchema })) })).safeParse(data.examPapers ?? []);
    const papers = new Map(paperRefs.success ? paperRefs.data.map(paper => [paper.id, paper]) : []);
    const attemptIds = new Set<string>();
    const answerIds = new Set<string>();
    const activePapers = new Set<string>();
    for (const [index, attempt] of attempts.entries()) {
        const paper = papers.get(attempt.paperId);
        const questionIds = new Set<string>();
        if (!paper || paper.userId !== attempt.userId || attemptIds.has(attempt.id)) {
            ctx.addIssue({ code: 'custom', path: ['examAttempts', index], message: 'Invalid attempt owner, paper or duplicate ID' });
        }
        attemptIds.add(attempt.id);
        if (attempt.status !== 'done') {
            if (activePapers.has(attempt.paperId)) ctx.addIssue({ code: 'custom', path: ['examAttempts', index], message: 'Multiple unfinished attempts for one paper' });
            activePapers.add(attempt.paperId);
        }
        for (const answer of attempt.answers) {
            if (answer.attemptId !== attempt.id || !paper?.questions.some(question => question.id === answer.examQuestionId) || questionIds.has(answer.examQuestionId) || answerIds.has(answer.id)) {
                ctx.addIssue({ code: 'custom', path: ['examAttempts', index, 'answers'], message: 'Invalid attempt answer reference or duplicate ID' });
            }
            questionIds.add(answer.examQuestionId);
            answerIds.add(answer.id);
        }
    }
    for (const [index, record] of (data.practiceRecords ?? []).entries()) {
        if (!record.examAttemptId) continue;
        const attempt = attempts.find(attempt => attempt.id === record.examAttemptId);
        if (!attempt || attempt.userId !== record.userId || (record.examQuestionId && !papers.get(attempt.paperId)?.questions.some(question => question.id === record.examQuestionId))) {
            ctx.addIssue({ code: 'custom', path: ['practiceRecords', index, 'examAttemptId'], message: 'Invalid practice attempt reference' });
        }
    }
    const pages = new Map((data.sourcePages ?? []).map(page => [page.id, page]));
    const items = new Map(data.errorItems.map(item => [item.id, item]));
    const regionIds = new Set<string>();
    if (pages.size !== (data.sourcePages ?? []).length) {
        ctx.addIssue({ code: 'custom', path: ['sourcePages'], message: '出处页 ID 重复' });
    }
    for (const [index, region] of (data.questionRegions ?? []).entries()) {
        const page = pages.get(region.pageId);
        const item = items.get(region.errorItemId);
        if (!page || !item || page.userId !== item.userId || regionIds.has(region.id)) {
            ctx.addIssue({ code: 'custom', path: ['questionRegions', index], message: '区域引用无效、跨用户或 ID 重复' });
        }
        regionIds.add(region.id);
    }
});

export type ParseBackupFileResult =
    | { success: true; data: ImportableBackupFile }
    | { success: false; error: string };

/** 解析并校验备份文件的顶层结构，失败时返回可读错误 */
export function parseBackupFile(input: unknown): ParseBackupFileResult {
    const result = backupFileSchema.safeParse(input);
    if (!result.success) {
        const issues = result.error.issues
            .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
            .join("; ");
        return { success: false, error: `Invalid backup file: ${issues}` };
    }
    return { success: true, data: result.data as unknown as ImportableBackupFile };
}
