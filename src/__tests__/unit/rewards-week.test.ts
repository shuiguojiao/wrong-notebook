import { describe, expect, it } from 'vitest';
import { summarizeRewardWeek } from '@/lib/rewards/week';
import type { BadgeRecord } from '@/lib/rewards/badges';
import type { Award } from '@/lib/rewards/rules';

const record = (id: string, stars = 4, overrides: Partial<BadgeRecord> = {}): BadgeRecord => ({ id, source: 'review', result: 'wrong',
    errorItemId: id, difficultyStars: stars, difficulty: null, examAttemptId: null, createdAt: new Date('2026-11-03T04:00:00Z'), ...overrides });
const entry = (type: string, points: number, meta: object = {}, refKey = `${type}:1`): Award => ({ type, points, refKey, day: '2026-11-03', meta: JSON.stringify(meta) });
const base = { start: '2026-11-02', today: '2026-11-11', timeZone: 'Asia/Shanghai', goalDays: 4, completedDays: ['2026-11-03'],
    items: new Map(['a', 'b', 'c'].map(id => [id, { questionText: '**题目** $x^2$', ocrText: null, subjectName: '数学' }])) };

describe('周手账纯函数汇总', () => {
    it('最高难度优先，同星级取较晚，完全同刻用 id 稳定排序，删除题目不参与', () => {
        const records = [record('a', 5), record('b', 5, { source: 'exam', createdAt: new Date('2026-11-04T04:00:00Z') }),
            record('c', 4, { createdAt: new Date('2026-11-05T04:00:00Z') }), record('deleted', 5, { createdAt: new Date('2026-11-06T04:00:00Z') })];
        expect(summarizeRewardWeek({ ...base, records, entries: [] }).bravest).toEqual({ errorItemId: 'b', difficultyStars: 5,
            result: 'wrong', preview: '题目 $x^2$', subjectName: '数学', day: '2026-11-04' });
        records.push(record('c', 5, { createdAt: records[1].createdAt }));
        expect(summarizeRewardWeek({ ...base, records: records.toReversed(), entries: [] }).bravest?.errorItemId).toBe('c');
    });
    it('应用周边界、有效作答与回填过滤同 summary，勇者数不受三道上限', () => {
        const records = ['a', 'b', 'c', 'a'].map(id => record(id));
        records.push(record('a', 5, { source: 'manual' }), record('b', 5, { source: 'practice' }), record('c', 5, { result: 'not_attempted' }),
            record('c', 5, { source: 'duplicate_import' }), record('c', 5, { createdAt: new Date('2026-11-08T16:00:00Z') }));
        const entries = [entry('weekly', 30, {}, 'week:2026-11-02'), entry('blindbox', 0, { stickerId: 'space-star' }), entry('fun_set', 50),
            entry('sticker', 20, {}, 'sticker:["math","builtin","方程"]'), entry('sticker', 20, { backfilled: true }),
            entry('badge', 0, { badgeId: 'brave-1' }), entry('badge', 0, { badgeId: 'sticker-1', backfilled: true }),
            entry('streak', 20, { backfilled: true }), entry('correction', 2, { backfilled: true }), entry('leave_use', 0)];
        expect(summarizeRewardWeek({ ...base, records, entries })).toMatchObject({ start: base.start, end: '2026-11-08', reviewDays: 1,
            goalDays: 4, goalReached: true, answered: 4, corrections: 1, braveAnswers: 4, beans: 102,
            badges: ['brave-1'], stickers: ['方程'], funStickers: ['space-star'], empty: false });
    });
    it('只有举一反三练习的周按空周处理', () => {
        const input = { ...base, records: [record('p', 4, { source: 'practice' })], entries: [], completedDays: [] };
        expect(summarizeRewardWeek(input)).toMatchObject({ empty: true, answered: 0, reviewDays: 0, braveAnswers: 0 });
    });
    it('当前周不统计今天之后的日期，未知难度按三星预览，空周没有最勇敢作答', () => {
        const input = { ...base, start: '2026-11-09', records: [record('a', 5, { createdAt: new Date('2026-11-12T04:00:00Z') })],
            entries: [{ ...entry('weekly', 30), day: '2026-11-12' }], completedDays: ['2026-11-12'] };
        expect(summarizeRewardWeek(input)).toMatchObject({ empty: true, bravest: null, beans: 0, reviewDays: 0 });
        expect(summarizeRewardWeek({ ...base, records: [record('a', 3, { difficultyStars: null })], entries: [] }).bravest?.difficultyStars).toBe(3);
    });
});
