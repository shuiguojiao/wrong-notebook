import { describe, expect, it } from 'vitest';
import { awardsForBadges, REWARD_BADGES } from '@/lib/rewards/badges';
import type { BadgeId, BadgeInput, BadgeRecord } from '@/lib/rewards/badges';
import { rewardMeta, shiftDay } from '@/lib/rewards/rules';
import type { Award } from '@/lib/rewards/rules';
import { computeStudentProgress } from '@/lib/student-progress';
import type { StudentProgress } from '@/lib/student-progress';

const now = new Date('2026-11-11T10:00:00Z');
const timeZone = 'Asia/Shanghai';
const today = '2026-11-11';
const progress = () => computeStudentProgress([], 50, now, timeZone);
const input = (overrides: Partial<BadgeInput> = {}): BadgeInput => ({ records: [], existing: [], completedDays: new Set(),
    progress: progress(), notebooks: [], now, timeZone, firstSettlement: true, ...overrides });
const entry = (type: string, day: string, index = 0, backfilled = false): Award => ({ type, day, points: 0,
    refKey: `${type}:${index}`, meta: JSON.stringify({ rulesVersion: 1, ...(backfilled ? { backfilled: true } : {}) }) });
const record = (index: number, overrides: Partial<BadgeRecord> = {}): BadgeRecord => ({ id: String(index).padStart(3, '0'),
    errorItemId: 'item', source: 'review', result: 'wrong', examAttemptId: null, difficulty: null, difficultyStars: 4,
    createdAt: new Date(`2026-11-${String(index + 1).padStart(2, '0')}T00:00:00Z`), ...overrides });
const award = (id: BadgeId, data: BadgeInput) => awardsForBadges(data).find(value => value.refKey === `badge:${id}`);

describe('成就章逐项达成与边界', () => {
    it.each([1, 3, 7, 14, 30, 100] as const)('连续 %i 天扫描历史首次到达日，少一天不达成', n => {
        const days = Array.from({ length: n }, (_, index) => shiftDay('2026-01-01', index));
        const id = `streak-${n}` as const;
        const result = award(id, input({ completedDays: new Set([...days, '2026-10-01']) }));
        expect(result?.day).toBe(days[n - 1]);
        expect(rewardMeta(result!.meta).backfilled).toBeUndefined();
        expect(award(id, input({ completedDays: new Set(days.slice(1)) }))).toBeUndefined();
    });
    it.each([1, 10] as const)('第 %i 次勇者作答不受每日上限影响，少一次不达成', n => {
        const records = Array.from({ length: n }, (_, index) => record(index, { source: index % 2 ? 'exam' : 'review' }));
        const result = award(`brave-${n}`, input({ records }));
        expect(result?.day).toBe(`2026-11-${String(n).padStart(2, '0')}`);
        expect(rewardMeta(result!.meta).backfilled).toBeUndefined();
        expect(award(`brave-${n}`, input({ records: records.slice(1) }))).toBeUndefined();
        const sameDay = records.map((value, index) => ({ ...value, createdAt: new Date(now.getTime() - (n - index) * 1000) }));
        expect(award(`brave-${n}`, input({ records: sameDay }))?.day).toBe(today);
    });
    it('摔倒再爬起需要同题先错后对，记录乱序仍按时间计算', () => {
        const wrong = record(0);
        const correct = record(1, { result: 'correct' });
        expect(award('brave-comeback', input({ records: [correct, wrong] }))?.day).toBe('2026-11-02');
        for (const records of [[correct], [record(0, { result: 'correct' }), record(1)], [wrong, { ...correct, errorItemId: 'other' }]]) {
            expect(award('brave-comeback', input({ records }))).toBeUndefined();
        }
    });
    it('第一张贴纸要求收集册已贴上，优先真实日期，否则标回填', () => {
        const p = { ...progress(), earned: 1 };
        expect(award('sticker-1', input())).toBeUndefined();
        const historical = award('sticker-1', input({ progress: p, existing: [entry('sticker', '2026-10-01')] }));
        expect(historical?.day).toBe('2026-10-01');
        expect(rewardMeta(historical!.meta).backfilled).toBeUndefined();
        const fallback = award('sticker-1', input({ progress: p, existing: [entry('sticker', '2026-10-01', 0, true)] }));
        expect(fallback?.day).toBe(today);
        expect(rewardMeta(fallback!.meta).backfilled).toBe(true);
    });
    it('整本掌握至少五题全部 mastered，首次结算标回填', () => {
        const ids = ['1', '2', '3', '4', '5'];
        const p: StudentProgress = { ...progress(), items: Object.fromEntries(ids.map(id => [id, { status: 'mastered' as const, pending: false }])) };
        const data = input({ progress: p, notebooks: [{ id: 'math', itemIds: ids }] });
        const result = award('notebook-mastered', data);
        expect(result?.day).toBe(today);
        expect(rewardMeta(result!.meta).backfilled).toBe(true);
        expect(rewardMeta(award('notebook-mastered', { ...data, firstSettlement: false })!.meta).backfilled).toBeUndefined();
        expect(award('notebook-mastered', { ...data, notebooks: [{ id: 'math', itemIds: ids.slice(1) }] })).toBeUndefined();
        p.items['5'].status = 'reviewing';
        expect(award('notebook-mastered', data)).toBeUndefined();
    });
    it('三连贴取同一周第三张日期，跨周、两张、回填不算', () => {
        const entries = ['2026-11-02', '2026-11-04', '2026-11-08'].map((day, index) => entry('sticker', day, index));
        expect(award('sticker-week-3', input({ existing: entries.toReversed() }))?.day).toBe('2026-11-08');
        expect(award('sticker-week-3', input({ existing: entries.slice(1) }))).toBeUndefined();
        expect(award('sticker-week-3', input({ existing: [...entries.slice(0, 2), entry('sticker', '2026-11-09', 3)] }))).toBeUndefined();
        expect(award('sticker-week-3', input({ existing: [...entries.slice(0, 2), entry('sticker', '2026-11-08', 3, true)] }))).toBeUndefined();
    });
    it('知错就改取第十条改正日期，回填也算，九条不算', () => {
        const existing = Array.from({ length: 10 }, (_, index) => entry('correction', shiftDay('2026-10-01', index), index, true));
        expect(award('correction-10', input({ existing: existing.toReversed() }))?.day).toBe('2026-10-10');
        expect(rewardMeta(award('correction-10', input({ existing }))!.meta).backfilled).toBeUndefined();
        expect(award('correction-10', input({ existing: existing.slice(1) }))).toBeUndefined();
    });
    it('早起鸟要求 done 且全部有效复习在应用时区七点前，06:59 算，07:00 不算', () => {
        const early = record(0, { createdAt: new Date('2026-11-10T22:59:00Z') });
        const late = record(1, { createdAt: new Date('2026-11-10T23:00:00Z') });
        const data = input({ records: [early], existing: [entry('done', today)] });
        expect(award('early-bird', data)?.day).toBe(today);
        expect(award('early-bird', { ...data, records: [early, late] })).toBeUndefined();
        expect(award('early-bird', { ...data, records: [] })).toBeUndefined();
        expect(award('early-bird', { ...data, existing: [] })).toBeUndefined();
    });
    it('周末也在只认同一周六日，跨周或只有一天不算', () => {
        expect(award('weekend', input({ completedDays: new Set(['2026-11-07', '2026-11-08']) }))?.day).toBe('2026-11-08');
        expect(award('weekend', input({ completedDays: new Set(['2026-11-01', '2026-11-07']) }))).toBeUndefined();
        expect(award('weekend', input({ completedDays: new Set(['2026-11-08']) }))).toBeUndefined();
    });
    it('全勤周按周一到周日，连续七天跨周不算，差一天不算', () => {
        const days = Array.from({ length: 7 }, (_, index) => shiftDay('2026-11-02', index));
        expect(award('full-week', input({ completedDays: new Set(days) }))?.day).toBe('2026-11-08');
        expect(award('full-week', input({ completedDays: new Set(days.slice(1)) }))).toBeUndefined();
        expect(award('full-week', input({ completedDays: new Set(days.map(day => shiftDay(day, -1))) }))).toBeUndefined();
    });
    it('只有 review/exam 的有效四星作答计勇气，不含未来记录', () => {
        const records = [record(0, { source: 'practice' }), record(1, { source: 'manual' }), record(2, { source: 'duplicate_import' }),
            record(3, { result: 'not_attempted' }), record(4, { difficultyStars: 3 }), record(5, { createdAt: new Date('2026-12-01') })];
        expect(award('brave-1', input({ records }))).toBeUndefined();
    });
    it('全部十六枚按定义顺序且重复结算不重发，当前数据回落也不撤章', () => {
        expect(REWARD_BADGES).toHaveLength(16);
        expect(REWARD_BADGES.filter(badge => badge.hidden).map(badge => badge.id)).toEqual(['early-bird', 'weekend', 'full-week']);
        const existing = REWARD_BADGES.map(badge => ({ ...entry('badge', today), refKey: `badge:${badge.id}` }));
        expect(awardsForBadges(input({ existing, records: [record(0)], completedDays: new Set([today]) }))).toEqual([]);
        expect(awardsForBadges(input({ existing }))).toEqual([]);
        expect(existing).toHaveLength(16);
    });
});
