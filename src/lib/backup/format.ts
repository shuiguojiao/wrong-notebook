import { z } from "zod";
import { REPORT_CATEGORIES, REPORT_STATUSES, reportSnapshotSchema, REPORT_DESCRIPTION_LIMIT, REPORT_NOTE_LIMIT } from "@/lib/problem-reports/schema";
import { REMINDER_CHANNELS, reminderTimeSchema } from "@/lib/reminders/schema";

/**
 * 备份文件的格式定义，导出与导入共用。
 * AgentToken 属于凭据，明确排除在所有用户及全量备份之外，不改变备份版本。
 * AiUsage 是运维统计，明确排除在用户备份之外；新增 token 字段不改变备份版本。
 * 导出侧写出的结构是导入侧可接受结构的超集；旧版本缺失的字段在类型上标为可选。
 * 日期字段在导出侧为 Prisma 返回的 Date，JSON 序列化后即为 ISO 字符串，
 * 因此类型上同时接受 string 与 Date。
 */

/** 当前备份文件版本号。图片仍使用 data URL；本机文件引用属于内部实现，不改变备份格式。 */
export const BACKUP_VERSION = 14;

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
    figureSvg?: string | null;
    /** 包含原题复习 review；沿用字符串字段，无需提升备份版本。 */
    source?: string;
    examQuestionId?: string | null;
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
    problemReports?: BackupProblemReport[];
    examPapers: BackupExamPaper[];
    paperGroups: BackupPaperGroup[];
    /** 动画讲解的云端语音 */
    ttsSpeeches: unknown[];
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
    problemReports?: BackupProblemReport[];
    examPapers?: ImportedBackupExamPaper[];
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
        reminderEnabled: z.boolean().optional(),
        reminderChannel: z.enum(REMINDER_CHANNELS).nullable().optional(),
        reminderCredential: z.string().min(1).max(2048).nullable().optional(),
        reminderTime: reminderTimeSchema.optional(),
        reminderLastSentAt: z.union([z.iso.datetime(), z.date()]).nullable().optional(),
        reminderLastResult: z.enum(['accepted', 'failed', 'no_due']).nullable().optional(),
    }).passthrough(),
    errorItems: z.array(z.unknown()),
    problemReports: z.array(backupReportSchema).optional(),
}).passthrough();

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
