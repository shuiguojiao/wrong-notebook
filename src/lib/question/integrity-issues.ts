import type { QuestionIntegrityResult } from '@/lib/ai/integrity';
import type { CheckIssue } from './check-rules';

/** 仅有明确证据的结论进入用户入口，其余留给代理排查。 */
export function integrityIssues(result: QuestionIntegrityResult): CheckIssue[] {
    const issues: CheckIssue[] = [];
    if (result.sameQuestion === 'no' && result.confidence >= 0.8) {
        issues.push({ code: 'image_mismatch', severity: 'major', visibility: 'user', field: 'originalImageUrl', evidence: result.imageText || result.summary });
    }
    for (const diff of result.textDiffs) {
        if (!diff.imageSays.trim() || diff.imageSays === diff.textSays) continue;
        issues.push({
            code: diff.severity === 'major' ? 'text_diff' : 'text_diff_minor',
            severity: diff.severity, visibility: diff.severity === 'major' ? 'user' : 'agent', field: 'questionText',
            evidence: diff.imageSays, suggestion: { textSays: diff.textSays, imageSays: diff.imageSays },
        });
    }
    if (result.crop === 'cut_off') issues.push({ code: 'crop_cut_off', severity: 'minor', visibility: 'agent', field: 'originalImageUrl' });
    if (result.studentAnswer === 'mismatch') issues.push({ code: 'student_answer_diff', severity: 'minor', visibility: 'agent', field: 'wrongAnswerText', evidence: result.studentAnswerDiff });
    return issues;
}
