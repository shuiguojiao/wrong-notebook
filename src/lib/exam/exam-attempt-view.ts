import { answeredDateToISOString, formatDateTime } from "@/lib/date-time";
import { summarizeExamScores } from "@/lib/exam/exam-score";
import type { ExamAttemptAnswer, ExamAttemptDetail, ExamAttemptQuestion } from "@/types/api";

export interface AttemptQuestionView {
    question: ExamAttemptQuestion;
    answer?: ExamAttemptAnswer;
}
export type AttemptGroupKey = 'all' | 'attention' | 'wrong' | 'not_attempted' | 'correct';
export interface AttemptGroup { key: AttemptGroupKey; items: AttemptQuestionView[] }

export function attemptQuestions(attempt: ExamAttemptDetail): AttemptQuestionView[] {
    const answers = new Map(attempt.answers.map(answer => [answer.examQuestionId, answer]));
    return [...attempt.paper.questions].sort((a, b) => (a.displayNumber ?? a.order) - (b.displayNumber ?? b.order)).map(question => ({ question, answer: answers.get(question.id) }));
}

export function groupAttemptQuestions(attempt: ExamAttemptDetail): AttemptGroup[] {
    const items = attemptQuestions(attempt);
    // 尚未保存过的手动录入始终按题号平铺，包括重新打开已有部分选择的作答。
    if (attempt.kind === 'manual' && !attempt.confirmedAt && attempt.status !== 'done') return [{ key: 'all', items }];
    const groups: AttemptGroup[] = (['attention', 'wrong', 'not_attempted', 'correct'] as const).map(key => ({ key, items: [] }));
    for (const item of items) {
        const answer = item.answer;
        const attention = !answer?.finalResult || answer.aiResult === 'unknown'
            || Boolean(answer.handMark && answer.aiResult && answer.handMark !== answer.aiResult);
        const key = attention ? 'attention' : answer!.finalResult;
        groups.find(group => group.key === key)!.items.push(item);
    }
    return groups.filter(group => group.items.length > 0);
}

export function isResultChanged(answer?: ExamAttemptAnswer): boolean {
    // 纸上已经批改时预填以红笔为准，不能把红笔与 AI 的冲突当成人工修改。
    const prefilled = answer?.handMark ?? answer?.aiResult;
    return Boolean(answer?.finalResult && prefilled && answer.finalResult !== prefilled);
}

export function summarizeAttempt(attempt: ExamAttemptDetail) {
    const items = attemptQuestions(attempt);
    const remaining = items.filter(item => item.question.errorItemId && !item.answer?.finalResult);
    const scores = summarizeExamScores(items.map(item => item.question.score));
    const earned = summarizeExamScores(items.map(item => item.answer?.finalResult === 'correct' ? item.question.score : 0));
    return {
        total: items.length,
        correct: items.filter(item => item.answer?.finalResult === 'correct').length,
        remaining: remaining.length,
        firstUnjudged: remaining[0]?.question.id,
        score: scores.unscored === 0 && scores.total !== null ? { earned: earned.total ?? 0, total: scores.total } : null,
    };
}

export function canEditAttempt(attempt: ExamAttemptDetail, editing: boolean): boolean {
    return attempt.status === 'reviewing' || (attempt.status === 'done' && editing);
}

export function manualAttemptDate(attempt: ExamAttemptDetail, timeZone: string, now = new Date()): string {
    return formatDateTime(attempt.submittedAt ?? now, 'yyyy-MM-dd', timeZone);
}

export function manualTakenAt(date: string, timeZone: string, now = new Date()): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > formatDateTime(now, 'yyyy-MM-dd', timeZone)) return null;
    try {
        const value = answeredDateToISOString(date, timeZone, now);
        return formatDateTime(value, 'yyyy-MM-dd', timeZone) === date ? value : null;
    } catch { return null; }
}
