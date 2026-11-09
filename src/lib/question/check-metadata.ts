import { z } from "zod";
import type { StoredCheckIssue } from "@/lib/question/check-store";

export interface CheckContext {
    origin: "legacy" | "import";
    observedAt: string;
    surfacedAt?: string;
    deferredUntil?: string;
    importIssueCodes?: string[];
    handling?: Array<{ code: string; action: string; at: string; durationMs?: number }>;
}

const contextSchema = z.object({
    origin: z.enum(["legacy", "import"]), observedAt: z.iso.datetime(),
    surfacedAt: z.iso.datetime().optional(), deferredUntil: z.iso.datetime().optional(),
    importIssueCodes: z.array(z.string()).optional(),
    handling: z.array(z.object({ code: z.string(), action: z.string(), at: z.iso.datetime(), durationMs: z.number().int().min(0).max(3_600_000).optional() })).optional(),
});

export const CONTEXT_CODE = "check_context";
export function checkContext(issues: StoredCheckIssue[]): CheckContext | undefined {
    const result = contextSchema.safeParse(issues.find(issue => issue.code === CONTEXT_CODE)?.context);
    return result.success ? result.data : undefined;
}
export function withCheckContext(issues: StoredCheckIssue[], context: CheckContext): StoredCheckIssue[] {
    return [...issues.filter(issue => issue.code !== CONTEXT_CODE), {
        code: CONTEXT_CODE, field: "checkIssues", source: "rules", visibility: "agent", severity: "minor", context,
    }];
}
export function rememberImportIssues(issues: StoredCheckIssue[]): StoredCheckIssue[] {
    const context = checkContext(issues);
    if (context?.origin !== "import") return issues;
    return withCheckContext(issues, { ...context, importIssueCodes: [...new Set([
        ...context.importIssueCodes ?? [], ...issues.filter(issue => issue.visibility === "user").map(issue => issue.code),
    ])] });
}

/** 已处理完的题后来发现新类型时，重新申请当天额度；旧忽略记录照常保留。 */
export function mergeCheckMetadata(previous: StoredCheckIssue[], current: StoredCheckIssue[]): StoredCheckIssue[] {
    let context = checkContext(previous);
    const active = (issues: StoredCheckIssue[]) => issues.some(issue => issue.visibility === "user" && !issue.dismissed && !issue.resolved);
    if (context?.origin === "legacy" && !active(previous) && active(current)) {
        context = { ...context, observedAt: new Date().toISOString(), surfacedAt: undefined, deferredUntil: undefined };
    }
    return rememberImportIssues(context ? withCheckContext(current, context) : current);
}
