import type { ExamAttemptAnswer, ExamAttemptDetail, PracticeResult } from '@/types/api';

export function attemptAnswer(questionId: string, result: PracticeResult | null = null): ExamAttemptAnswer {
    return { id: `answer-${questionId}`, examQuestionId: questionId, answerText: null, answerImageUrl: null, recognizedAnswer: null, handMark: null, aiResult: null, aiReason: null, finalResult: result };
}

export function examAttempt(): ExamAttemptDetail {
    return {
        id: 'attempt', number: 2, kind: 'manual', status: 'reviewing', startedAt: '2026-10-19T03:27:00Z', submittedAt: null, confirmedAt: null, durationSec: null,
        answers: [],
        paper: {
            id: 'paper-1', title: '数学练习', questions: [1, 2, 3].map(n => ({
                id: `q${n}`, order: n, questionText: `题干 ${n} $x^2$`, score: 2.5, errorItemId: n === 3 ? null : `e${n}`,
                figureSvg: null, figureScale: 100, figureAlign: 'center', answerText: `参考 ${n}`, analysis: `解析 ${n}`,
            })),
        },
    };
}
