import { describe, expect, it } from 'vitest';
import { pickBraveItem } from '@/lib/rewards/brave';
import type { BraveCandidate } from '@/lib/rewards/brave';

const now = new Date('2026-11-11T10:00:00Z');
const timeZone = 'Asia/Shanghai';
const item = (id: string, overrides: Partial<BraveCandidate> = {}): BraveCandidate => ({
    id, difficultyStars: 4, masteryStatus: 'new', nextReviewAt: new Date('2026-11-12T00:00:00Z'), inTodayQueue: false, ...overrides,
});
const pick = (items: BraveCandidate[]) => pickBraveItem(items, now, timeZone)?.id ?? null;

describe('勇者题确定性选题', () => {
    it('今日额度队列优先于未到期的五星题', () => {
        expect(pick([item('future', { difficultyStars: 5 }), item('today', { inTodayQueue: true })])).toBe('today');
    });
    it('无今日候选时选未到期题，不选被额度排除的到期积压', () => {
        expect(pick([item('backlog', { difficultyStars: 5, nextReviewAt: new Date('2026-11-10') }), item('future')])).toBe('future');
    });
    it('按难度、日期、id 排序且不修改输入，空日期最后', () => {
        const items = [item('null', { nextReviewAt: null }), item('b'), item('a'), item('later', { nextReviewAt: new Date('2026-11-13') })];
        expect(pick(items)).toBe('a');
        expect(pick(items.toReversed())).toBe('a');
        expect(items[0].id).toBe('null');
        expect(pick([...items, item('five', { difficultyStars: 5, nextReviewAt: null })])).toBe('five');
        expect(pick([item('b', { inTodayQueue: true }), item('a', { inTodayQueue: true })])).toBe('a');
    });
    it('三星、无星级与已掌握的题不入选', () => {
        expect(pick([item('three', { difficultyStars: 3 }), item('unknown', { difficultyStars: null }), item('mastered', { masteryStatus: 'mastered' })])).toBeNull();
    });
    it('无候选返回 null，应用日末边界按时区判定', () => {
        expect(pick([])).toBeNull();
        expect(pick([item('due', { nextReviewAt: new Date('2026-11-11T15:59:59Z') })])).toBeNull();
        expect(pick([item('future', { nextReviewAt: new Date('2026-11-11T16:00:00Z') })])).toBe('future');
        expect(pick([item('unscheduled', { nextReviewAt: null })])).toBe('unscheduled');
    });
});
