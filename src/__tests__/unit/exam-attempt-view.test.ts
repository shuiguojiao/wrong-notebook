import { describe, expect, it } from 'vitest';
import { canEditAttempt, groupAttemptQuestions, isResultChanged, manualAttemptDate, manualTakenAt, summarizeAttempt } from '@/lib/exam/exam-attempt-view';
import { attemptAnswer, examAttempt } from '../fixtures/exam-attempt';

describe('批改结果页视图规则', () => {
    it('全空的手动录入为普通列表，题号排序且不修改原数组', () => {
        const attempt = examAttempt();
        attempt.paper.questions.reverse();
        expect(groupAttemptQuestions(attempt).map(group => [group.key, group.items.map(item => item.question.id)])).toEqual([['all', ['q1', 'q2', 'q3']]]);
        expect(attempt.paper.questions[0].id).toBe('q3');
    });

    it('按纸卷连续题号排序，兼容按题型分大题后的编号', () => {
        const attempt = examAttempt();
        attempt.paper.questions[0].displayNumber = 3;
        attempt.paper.questions[1].displayNumber = 1;
        attempt.paper.questions[2].displayNumber = 2;
        expect(groupAttemptQuestions(attempt)[0].items.map(item => item.question.id)).toEqual(['q2', 'q3', 'q1']);
        expect(summarizeAttempt(attempt).firstUnjudged).toBe('q2');
    });

    it('首次保存前的手动录入已有部分或全部结果也保持平铺，保存后才分组', () => {
        const attempt = examAttempt();
        attempt.answers = [attemptAnswer('q1', 'correct')];
        expect(groupAttemptQuestions(attempt).map(group => group.key)).toEqual(['all']);
        attempt.answers.push(attemptAnswer('q2', 'wrong'), attemptAnswer('q3', 'not_attempted'));
        expect(groupAttemptQuestions(attempt).map(group => group.key)).toEqual(['all']);
        attempt.status = 'done';
        attempt.confirmedAt = '2026-10-19T03:27:00Z';
        expect(groupAttemptQuestions(attempt).map(group => group.key)).toEqual(['wrong', 'not_attempted', 'correct']);
    });

    it('未知、未判和纸上/AI 冲突优先，其后差一点、没做、做对；隐藏空组', () => {
        const attempt = examAttempt();
        attempt.kind = 'photo';
        attempt.paper.questions = Array.from({ length: 7 }, (_, i) => ({ ...attempt.paper.questions[0], id: `q${i}`, order: 7 - i }));
        attempt.answers = [attemptAnswer('q0', 'correct'), attemptAnswer('q1', 'not_attempted'), attemptAnswer('q2', 'wrong'),
            { ...attemptAnswer('q3', 'wrong'), aiResult: 'unknown' },
            { ...attemptAnswer('q4', 'correct'), aiResult: 'wrong', handMark: 'correct' }, attemptAnswer('q5')];
        expect(groupAttemptQuestions(attempt).map(group => [group.key, group.items.map(item => item.question.id)])).toEqual([
            ['attention', ['q6', 'q5', 'q4', 'q3']], ['wrong', ['q2']], ['not_attempted', ['q1']], ['correct', ['q0']],
        ]);
    });

    it('即时统计与小数得分，删除的原题不要求选择；任一题无分值时隐藏得分', () => {
        const attempt = examAttempt();
        expect(summarizeAttempt(attempt)).toMatchObject({ remaining: 2, firstUnjudged: 'q1', total: 3, correct: 0, score: { earned: 0, total: 7.5 } });
        attempt.answers = [attemptAnswer('q1', 'correct'), attemptAnswer('q2', 'not_attempted')];
        expect(summarizeAttempt(attempt)).toMatchObject({ remaining: 0, firstUnjudged: undefined, correct: 1, score: { earned: 2.5, total: 7.5 } });
        attempt.paper.questions[2].score = null;
        expect(summarizeAttempt(attempt).score).toBeNull();
    });

    it('仅与 AI 预填不同的修改显示已改，手动选择和相同结果不显示', () => {
        expect(isResultChanged()).toBe(false);
        expect(isResultChanged(attemptAnswer('q1', 'wrong'))).toBe(false);
        expect(isResultChanged({ ...attemptAnswer('q1', 'correct'), aiResult: 'correct' })).toBe(false);
        expect(isResultChanged({ ...attemptAnswer('q1', 'correct'), aiResult: 'wrong' })).toBe(true);
        expect(isResultChanged({ ...attemptAnswer('q1', 'not_attempted'), aiResult: 'unknown' })).toBe(true);
        expect(isResultChanged({ ...attemptAnswer('q1', 'correct'), handMark: 'correct', aiResult: 'wrong' })).toBe(false);
        expect(isResultChanged({ ...attemptAnswer('q1', 'wrong'), handMark: 'correct', aiResult: 'wrong' })).toBe(true);
    });

    it('已保存默认只读，仅明确改结果后可编辑；作答和批改中不可编辑', () => {
        const attempt = examAttempt();
        expect(canEditAttempt(attempt, false)).toBe(true);
        attempt.status = 'done';
        expect(canEditAttempt(attempt, false)).toBe(false);
        expect(canEditAttempt(attempt, true)).toBe(true);
        for (const status of ['answering', 'grading'] as const) {
            attempt.status = status;
            expect(canEditAttempt(attempt, true)).toBe(false);
        }
    });

    it('默认今天，补录历史日期按应用时区中午，拒绝未来与非法日期', () => {
        const attempt = examAttempt();
        const now = new Date('2026-10-19T03:27:00Z');
        expect(manualAttemptDate(attempt, 'America/New_York', now)).toBe('2026-10-18');
        expect(manualTakenAt('2026-10-18', 'America/New_York', now)).toBe(now.toISOString());
        expect(manualTakenAt('2026-10-17', 'America/New_York', now)).toBe('2026-10-17T16:00:00.000Z');
        expect(manualTakenAt('2026-10-19', 'America/New_York', now)).toBeNull();
        expect(manualTakenAt('2026-02-30', 'Asia/Shanghai', now)).toBeNull();
        expect(manualTakenAt('', 'Asia/Shanghai', now)).toBeNull();
        attempt.submittedAt = '2026-10-16T16:00:00Z';
        expect(manualAttemptDate(attempt, 'America/New_York', now)).toBe('2026-10-16');
    });
});
