import type { StoredCheckIssue } from "@/lib/question/check-store";

export interface PendingIssue extends StoredCheckIssue { index: number }
export interface PendingQuestion {
    id: string;
    preview: string;
    updatedAt: string;
    issues: PendingIssue[];
    originalImageUrl: string;
    hasSource: boolean;
}
export interface PendingChecks { total: number; items: PendingQuestion[] }

export function visibleCheckIssues(issues: StoredCheckIssue[]): PendingIssue[] {
    return issues.flatMap((issue, index) => issue.visibility === "user" && !issue.dismissed && !issue.resolved ? [{ ...issue, index }] : []);
}

export function textSuggestion(issue: StoredCheckIssue) {
    const value = issue.suggestion;
    return value && typeof value === "object" && typeof value.textSays === "string" && typeof value.imageSays === "string"
        && value.textSays.length > 0 && value.imageSays.length > 0 ? value : null;
}
