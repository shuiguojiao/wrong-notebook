import { describe, expect, it } from 'vitest';
import { REVIEW_INTERVALS, rebuildReviewState, isReviewDue, reviewKind, reviewWindowDays, reviewPlanOf } from '@/lib/review-schedule';
import type { ReviewRecord } from '@/lib/review-schedule';

const zone = 'Asia/Shanghai';
const item = { id: 'q1', createdAt: new Date('2026-10-01T02:00:00Z'), subject: { name: '数学', subjectKey: 'math' } };
const record = (result: string, n: number, confidence?: string): ReviewRecord => ({ id: `r${String(n).padStart(3, '0')}`, result, confidence, createdAt: new Date(Date.UTC(2026, 9, 2 + n, 2)) });
const replay = (records: ReviewRecord[]) => rebuildReviewState(item, records, [], zone);

describe('分类间隔与可重放复习状态', () => {
    it.each(['english', 'English notebook', '英语错题'])('英语 %s 使用记忆型', name => {
        expect(reviewKind({ subject: { name, subjectKey: name === 'english' ? name : null } })).toBe('memory');
    });
    it('语文填空覆盖字词、默写、背诵，其余题型保守使用方法型', () => {
        for (const questionType of ['fill_blank', '填空题']) expect(reviewKind({ subject: { name: '语文' }, questionType })).toBe('memory');
        for (const questionType of ['single_choice', 'multiple_choice', 'true_false', 'calculation', 'solution', 'reading', 'cloze', 'writing', 'other', null]) {
            expect(reviewKind({ subject: { name: '语文', subjectKey: 'chinese' }, questionType })).toBe('method');
        }
    });
    it.each(['math', 'physics', 'chemistry', 'biology', 'history', 'geography', 'politics', 'unknown'])('%s 使用方法型', subjectKey => {
        expect(reviewKind({ subject: { name: '未知', subjectKey } })).toBe('method');
    });
    it('未知或无科目默认方法型，显式科目优先于名称', () => {
        expect(reviewKind({})).toBe('method'); expect(reviewKind({ subject: { name: '未识别' } })).toBe('method');
        expect(reviewKind({ subject: { name: '英语', subjectKey: 'math' } })).toBe('method');
    });
    it('初始化第零轮按录入日安排，旧记录不需要 confidence', () => {
        const state = replay([]);
        expect(state.reviewStage).toBe(0); expect(state.reviewWrongStreak).toBe(0); expect(state.reviewCompletedAt).toBeNull();
        expect(replay([record('correct', 0)]).reviewStage).toBe(1);
        expect(replay([record('correct', 0, 'unsure')])).toEqual(replay([record('correct', 0)]));
    });
    it.each([
        [0, 'correct', 'sure', 2, 0], [0, 'correct', 'unsure', 1, 0], [0, 'wrong', undefined, 0, 1],
        [1, 'wrong', undefined, 0, 1], [2, 'wrong', undefined, 0, 1], [3, 'wrong', undefined, 1, 1],
        [3, 'correct', 'sure', 4, 0], [3, 'correct', 'unsure', 4, 0],
    ] as const)('方法型从 %i 作答 %s/%s 到 %i', (initial, result, confidence, stage, wrongStreak) => {
        const state = replay([...Array.from({ length: initial }, (_, i) => record('correct', i)), record(result, initial, confidence)]);
        expect(state.reviewStage).toBe(stage); expect(state.reviewWrongStreak).toBe(wrongStreak);
        expect(state.nextReviewAt === null).toBe(stage === 4);
        expect(state.reviewCompletedAt).toEqual(stage === 4 ? record(result, initial).createdAt : null);
    });
    it('连续两次做错清零，未作答不打断错答连续，答对重置连续错误', () => {
        const initial = Array.from({ length: 4 }, (_, n) => record('correct', n));
        const memory = { ...item, subject: { name: '英语' } };
        const history = [...initial, record('wrong', 4), record('not_attempted', 5), record('wrong', 6)];
        expect(rebuildReviewState(memory, history, [], zone)).toMatchObject({ reviewStage: 0, reviewWrongStreak: 2 });
        expect(replay([...history, record('correct', 7)])).toMatchObject({ reviewStage: 1, reviewWrongStreak: 0 });
    });
    it('记忆型最后一轮有把握直接完成，完成后做错从最后一轮继续', () => {
        const memory = { ...item, subject: { name: '英语' } };
        const history = [...Array.from({ length: 3 }, (_, n) => record('correct', n)), record('correct', 3, 'sure')];
        expect(rebuildReviewState(memory, history, [], zone)).toMatchObject({ reviewStage: 5, nextReviewAt: null });
        expect(rebuildReviewState(memory, [...history, record('wrong', 4)], [], zone)).toMatchObject({ reviewStage: 2, reviewCompletedAt: null });
    });
    it('只重放最后手动调整之后的有效记录，完成后从最后一轮继续', () => {
        const at = record('correct', 2).createdAt;
        const history = [record('wrong', 0), record('correct', 1), record('correct', 2)];
        const completed = [{ action: 'completed' as const, at }];
        expect(rebuildReviewState(item, history, completed, zone)).toMatchObject({ reviewStage: 4, nextReviewAt: null, reviewCompletedAt: at });
        expect(rebuildReviewState(item, [...history, record('wrong', 3)], completed, zone)).toMatchObject({ reviewStage: 1, reviewWrongStreak: 1, reviewCompletedAt: null });
        expect(rebuildReviewState(item, history, [...completed, { action: 'restart', at: record('wrong', 4).createdAt }], zone)).toMatchObject({ reviewStage: 0, reviewWrongStreak: 0, nextReviewAt: new Date('2026-10-06T16:00:00Z') });
    });
    it('删除记录可恢复之前状态，乱序输入和相同时刻按 ID 确定排序，不改写源数组', () => {
        const a = record('wrong', 0); const b = { ...record('correct', 1, 'sure'), createdAt: a.createdAt };
        const history = [b, a]; const copy = [...history];
        expect(replay(history)).toEqual(replay([a, b])); expect(history).toEqual(copy);
        expect(replay(history).reviewStage).toBe(2); expect(replay([a]).reviewStage).toBe(0);
    });
    it('未作答不改变到期时间或完成时间', () => {
        expect(replay([record('not_attempted', 0)])).toEqual(replay([]));
        const done = Array.from({ length: 4 }, (_, i) => record('correct', i));
        expect(replay([...done, record('not_attempted', 6)])).toEqual(replay(done));
    });
    it('哈希选日确定且落在每个窗口内，不同题可分散', () => {
        const windows = { memory: [[1, 1], [3, 4], [6, 8], [13, 17], [26, 34]], method: [[3, 4], [6, 8], [18, 24], [40, 50]] };
        for (const kind of ['memory', 'method'] as const) {
            REVIEW_INTERVALS[kind].forEach((_, stage) => {
                for (let n = 0; n < 100; n++) {
                    const days = reviewWindowDays(String(n), stage, kind);
                    expect(days).toBe(reviewWindowDays(String(n), stage, kind));
                    expect(days).toBeGreaterThanOrEqual(windows[kind][stage][0]); expect(days).toBeLessThanOrEqual(windows[kind][stage][1]);
                }
            });
        }
        expect(new Set(Array.from({ length: 100 }, (_, n) => reviewWindowDays(String(n), 0, 'method'))).size).toBe(2);
    });
    it('跨夏令时仍按目标时区的日历零点排程，今天到期包含整个当天', () => {
        const state = rebuildReviewState({ ...item, createdAt: new Date('2026-03-08T06:30:00Z'), subject: { name: 'English' } }, [], [], 'America/New_York');
        expect(state.nextReviewAt).toEqual(new Date('2026-03-09T04:00:00Z'));
        expect(isReviewDue(reviewPlanOf(state), 'America/New_York', new Date('2026-03-09T05:00:00Z'))).toBe(true);
        expect(isReviewDue({ stage: 4, nextReviewAt: null }, zone)).toBe(false);
    });
});
