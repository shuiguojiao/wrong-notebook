import { describe, expect, it } from 'vitest';
import { compareSessionProgress, computeStudentProgress } from '@/lib/student-progress';
import type { ProgressItem, ProgressRecord } from '@/lib/student-progress';

const now = new Date('2026-11-10T16:01:00Z');
const zone = 'Asia/Shanghai';
const record = (createdAt = '2026-11-10T15:59:00Z', result = 'correct', source = 'review'): ProgressRecord => ({ id: createdAt, createdAt: new Date(createdAt), result, source });
const item = (overrides: Partial<ProgressItem> = {}): ProgressItem => ({ id: 'q', subjectId: 'math', subjectName: '数学', subjectKey: 'math', tags: [{ name: '方程', tagSet: 'default' }], masteryProbability: null, masteryEvaluatedAt: null, records: [], ...overrides });
const compute = (items: ProgressItem[], date = now) => computeStudentProgress(items, 50, date, zone);

describe('学生进度派生', () => {
    it('仅有题知识点入册，混合体系与学科不混组，去重并稳定排序，不截前十', () => {
        const items = Array.from({ length: 13 }, (_, i) => item({ id: `q${i}`, tags: [{ name: `标签${i}`, tagSet: 'default' }] }));
        items.push(item(), item({ id: 'other-set', tags: [{ name: '方程', tagSet: 'cnm' }] }), item({ id: 'other-subject', subjectId: 'other' }), item({ id: 'no-tags', tags: [] }));
        expect(compute(items).stickers).toHaveLength(16);
        expect(compute(items).stickers).toEqual(compute([...items].reverse()).stickers);
        expect(compute([])).toMatchObject({ stickers: [], earned: 0, streak: 0 });
        expect(compute([item({ tags: [item().tags[0], item().tags[0]] })]).stickers[0].total).toBe(1);
    });
    it('全掌握优先；同知识点任一题未掌握就不能贴上，剩余数按题计算', () => {
        const mastered = item({ records: [record()], masteryProbability: 0.8, masteryEvaluatedAt: new Date('2026-11-10T15:59:01Z') });
        expect(compute([mastered]).stickers[0].state).toBe('earned');
        expect(compute([mastered, item({ id: 'q2' })]).stickers[0]).toMatchObject({ state: 'improving', total: 2, remaining: 1 });
        expect(compute([mastered, item({ id: 'q2', records: [record(undefined, 'wrong')] })]).stickers[0].state).toBe('missing');
    });
    it('无记录、未作答、重复导入和未来作答不能奖励，只有近期有效全对才在好转', () => {
        for (const records of [[], [record(undefined, 'not_attempted')], [record(undefined, 'correct', 'duplicate_import')], [record('2026-11-11T16:01:00Z')]]) {
            expect(compute([item({ records, masteryProbability: 1 })]).stickers[0].state).toBe('missing');
        }
        expect(compute([item({ records: [record('2026-10-12T16:00:00Z')] })]).stickers[0].state).toBe('improving');
        expect(compute([item({ records: [record('2026-10-12T15:59:59Z')] })]).stickers[0].state).toBe('missing');
        expect(compute([item({ records: [record(undefined, 'correct', 'practice')] })])).toMatchObject({ streak: 0, reviewedToday: false });
    });
    it('按应用时区跨午夜归日；今天未复习保留昨天，连续中断后归零', () => {
        const records = [record('2026-11-09T16:00:00Z'), record('2026-11-09T15:59:59Z'), record(undefined, 'wrong', 'practice'), record(undefined, 'correct', 'manual')];
        expect(compute([item({ records })])).toMatchObject({ day: '2026-11-11', streak: 2, reviewedToday: false });
        expect(compute([item({ records: [...records, record('2026-11-10T16:00:00Z')] })])).toMatchObject({ streak: 3, reviewedToday: true });
        expect(compute([item({ records })], new Date('2026-11-11T16:00:00Z')).streak).toBe(0);
    });
    it('撤销和删题立即重算状态、贴纸与连续天数', () => {
        const source = item({ records: [record('2026-11-10T16:00:00Z')], masteryProbability: 0.8 });
        expect(compute([source]).earned).toBe(1);
        expect(compute([{ ...source, records: [] }])).toMatchObject({ earned: 0, streak: 0 });
        expect(compute([]).stickers).toEqual([]);
    });
    it('仅能确认首次掌握日时列入这周，不把最近评估日期或创建日期当首次', () => {
        const source = item({ records: [record()], masteryProbability: 0.8, masteryEvaluatedAt: new Date('2026-11-10T15:59:01Z') });
        expect(compute([source]).weeklyNew).toHaveLength(1);
        for (const overrides of [{ records: [record(), record('2026-11-09T00:00:00Z')] }, { masteryEvaluatedAt: new Date('2026-11-10T16:00:00Z') }, { records: [record('2026-11-08T15:59:00Z')], masteryEvaluatedAt: new Date('2026-11-08T15:59:01Z') }]) {
            expect(compute([item({ ...source, ...overrides })]).weeklyNew).toHaveLength(0);
        }
    });
    it('收工只统计本组已保存题的掌握变化；缺失、过期评估及失败不伪造奖励', () => {
        const before = compute([item()]);
        const after = compute([item({ records: [record()], masteryProbability: 0.8, masteryEvaluatedAt: new Date('2026-11-10T16:00:00Z') })]);
        expect(compareSessionProgress(before, after, ['q', 'q'])).toMatchObject({ mastered: 1, newStickers: [{ state: 'earned' }] });
        expect(compareSessionProgress(after, after, ['q'])).toEqual({ mastered: 0, newStickers: [] });
        expect(compareSessionProgress(before, compute([]), ['q']).mastered).toBeNull();
        const pending = compute([item({ records: [record()], masteryProbability: 0.8 })]);
        expect(compareSessionProgress(before, pending, ['q'])).toEqual({ mastered: null, newStickers: [] });
    });
});


it('请假卡只延长连续，不改变真实完成日、今日复习和本周知识点贴纸', () => {
    const leave = new Set(['2026-11-09', '2026-11-10']);
    const result = computeStudentProgress([], 50, new Date('2026-11-11T04:00:00Z'), zone, leave);
    expect(result).toMatchObject({ completedDays: [], leaveDays: ['2026-11-09', '2026-11-10'], streak: 2, reviewedToday: false, weeklyNew: [] });
});
