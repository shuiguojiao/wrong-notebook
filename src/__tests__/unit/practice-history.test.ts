import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/config', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));

import { practiceDateRange, practiceDayKey, practicePreview, resolvePracticeResult, summarizePracticeDay } from '@/lib/practice-history';

describe('做题记录纯函数', () => {
    it('按应用时区归日，正确区分 23:59 与 00:01', () => {
        expect(practiceDayKey('2026-11-10T15:59:00Z', 'Asia/Shanghai')).toBe('2026-11-10');
        expect(practiceDayKey('2026-11-10T16:01:00Z', 'Asia/Shanghai')).toBe('2026-11-11');
        expect(practiceDateRange('2026-11-10', 'Asia/Shanghai')).toEqual({
            start: new Date('2026-11-09T16:00:00Z'), end: new Date('2026-11-10T16:00:00Z'),
        });
    });

    it('日期范围保留夏令时切换日的自然日边界', () => {
        const { start, end } = practiceDateRange('2026-03-08', 'America/New_York');
        expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
        expect(end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    });

    it.each([
        ['correct', false, 'correct'], ['wrong', true, 'wrong'], ['not_attempted', false, 'not_attempted'],
        [null, true, 'correct'], [null, false, 'wrong'], [null, null, null], ['unknown', true, null],
    ])('结果 %s 与旧值 %s 回退为 %s', (result, isCorrect, expected) => {
        expect(resolvePracticeResult({ result, isCorrect })).toBe(expected);
    });

    it('小结排除没做和空结果，只累计复习用时', () => {
        expect(summarizePracticeDay([
            { source: 'review', result: 'correct', isCorrect: false, durationSec: 80 },
            { source: 'review', result: null, isCorrect: false, durationSec: 30 },
            { source: 'practice', result: 'correct', isCorrect: true, durationSec: 200 },
            { source: 'exam', result: 'not_attempted', isCorrect: false, durationSec: 300 },
            { source: 'review', result: null, isCorrect: null, durationSec: 400 },
            { source: 'review', result: 'wrong', isCorrect: false, durationSec: null },
        ])).toEqual({ total: 4, correct: 2, wrong: 2, notAttempted: 1, reviewDurationSec: 110 });
    });

    it('合并空白、保留 LaTeX，并按字符截取到 120 字', () => {
        expect(practicePreview('  已知\n $\\frac{x}{2}$\t 求 x  ')).toBe('已知 $\\frac{x}{2}$ 求 x');
        expect(practicePreview('题'.repeat(121))).toBe('题'.repeat(120));
        expect(practicePreview('😀'.repeat(121))).toBe('😀'.repeat(120));
        expect(practicePreview(null)).toBe('');
    });
});
