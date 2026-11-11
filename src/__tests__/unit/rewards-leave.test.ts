import { describe, expect, it } from 'vitest';
import { lastStreak, settleLeave } from '@/lib/rewards/leave';
import { shiftDay } from '@/lib/rewards/rules';
import type { Award } from '@/lib/rewards/rules';
import { computeCurrentStreak } from '@/lib/stats/stats-streak';

const first = '2026-10-01';
const day = (n: number) => shiftDay(first, n - 1);
const days = (...ns: number[]) => new Set(ns.map(day));
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const entry = (type: string, n: number): Award => ({ type, day: day(n), points: 0,
    refKey: type === 'leave_start' ? 'leave-start' : type === 'leave_earn' ? `leave-earn:${day(n)}` : `leave:${day(n)}`, meta: null });
const start = entry('leave_start', 1);
const earned = entry('leave_earn', 7);

describe('请假卡日历回放', () => {
    it('连续第七、十四天发卡，持有最多两张', () => {
        const result = settleLeave(days(...range(21)), [start], day(21));
        expect(result.map(value => [value.type, value.day, value.points])).toEqual([['leave_earn', day(7), 0], ['leave_earn', day(14), 0]]);
        expect(settleLeave(days(...range(21)), [start, ...result], day(21))).toEqual([]);
    });
    it('单个真实完成日缺口补卡并延续连续数', () => {
        const real = days(...range(7), 9);
        const result = settleLeave(real, [start, earned], day(9));
        expect(result).toEqual([entry('leave_use', 8)].map(value => ({ ...value, meta: '{"rulesVersion":1}' })));
        expect(computeCurrentStreak(new Set([...real, ...result.map(value => value.day)]), day(9))).toBe(9);
    });
    it('后来攒到的卡不能倒回去补更早的缺口', () => {
        // 第 3 天缺口发生时还没有卡，应断开；第 4 到 10 天连续 7 天在第 10 天得卡，不应回补第 3 天。
        const real = days(1, 2, ...range(10).slice(3));
        const result = settleLeave(real, [start], day(10));
        expect(result.map(value => [value.type, value.day])).toEqual([['leave_earn', day(10)]]);
        expect(settleLeave(real, [start, ...result], day(11))).toEqual([]);
    });
    it('连缺两天不补，即使有两张卡', () => {
        const real = days(...range(14), 17);
        expect(settleLeave(real, [start, earned, entry('leave_earn', 14)], day(17))).toEqual([]);
    });
    it('下一天是今天时预先补昨天，今天本身不补', () => {
        expect(settleLeave(days(...range(7)), [start, earned], day(9)).map(value => [value.type, value.day])).toEqual([['leave_use', day(8)]]);
        expect(settleLeave(days(...range(7)), [start, earned], day(8))).toEqual([]);
    });
    it('没有卡时缺口清零，后面六天不发卡', () => {
        const real = days(1, 3, 4, 5, 6, 7, 8);
        expect(settleLeave(real, [start], day(8))).toEqual([]);
        expect(computeCurrentStreak(real, day(8))).toBe(6);
    });
    it('补卡日也参与第七天发卡', () => {
        const real = days(...range(6));
        const stock = [start, entry('leave_earn', -7)];
        expect(settleLeave(real, stock, day(8)).map(value => [value.type, value.day])).toEqual([['leave_use', day(7)], ['leave_earn', day(7)]]);
    });
    it('首次结算只写启用日，不补更早的卡和缺口', () => {
        const real = days(...range(14), 16);
        const result = settleLeave(real, [], day(16));
        expect(result.map(value => [value.type, value.day, value.refKey])).toEqual([['leave_start', day(16), 'leave-start']]);
        expect(settleLeave(real, result, day(16))).toEqual([]);
    });
    it('重复回放不重复用卡，撤回真实作答也保留已用卡', () => {
        const real = days(...range(7), 9);
        const result = settleLeave(real, [start, earned], day(9));
        const existing = [start, earned, ...result];
        expect(settleLeave(real, existing, day(9))).toEqual([]);
        expect(settleLeave(days(9), existing, day(9))).toEqual([]);
        expect(existing.filter(value => value.type === 'leave_use')).toHaveLength(1);
        // 预补之后今天也缺席，次日不会退卡或连续补第二天。
        expect(settleLeave(days(...range(7)), existing, day(10))).toEqual([]);
    });
    it('温和归零取最近一段而非历史最长，未断时返回 null', () => {
        expect(lastStreak(days(...range(10), 13, 14), day(17), 0)).toBe(2);
        expect(lastStreak(new Set(), day(17), 0)).toBe(0);
        expect(lastStreak(days(16), day(17), 1)).toBeNull();
    });
});
