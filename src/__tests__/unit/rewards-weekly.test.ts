import { describe, expect, it, vi } from 'vitest';
import { FUN_STICKERS } from '@/lib/rewards/fun-stickers';
import { rewardMeta } from '@/lib/rewards/rules';
import type { Award } from '@/lib/rewards/rules';
import { settleWeekly } from '@/lib/rewards/weekly';

const today = '2026-11-12';
const real = new Set(['2026-11-09', '2026-11-10', '2026-11-11']);
const owned = (ids: string[]): Award[] => ids.map((stickerId, i) => ({ day: '2026-10-01', type: 'blindbox', points: 0,
    refKey: `box:old-${i}`, meta: JSON.stringify({ rulesVersion: 1, stickerId }) }));
const box = (awards: Award[]) => awards.find(entry => entry.type === 'blindbox')!;

describe('本周目标与不重复盲盒', () => {
    it('三套各十二张，id 与 nameKey 唯一且目录顺序固定', () => {
        expect(FUN_STICKERS).toHaveLength(36);
        expect(new Set(FUN_STICKERS.map(sticker => sticker.id)).size).toBe(36);
        expect(new Set(FUN_STICKERS.map(sticker => sticker.nameKey)).size).toBe(36);
        for (const set of ['stationery', 'animals', 'space']) expect(FUN_STICKERS.filter(sticker => sticker.setId === set)).toHaveLength(12);
    });
    it('达标才发放，每周一次，未来完成日不算', () => {
        const random = vi.fn(() => 0);
        expect(settleWeekly(new Set([...real, '2026-11-13']), 4, [], today, random)).toEqual([]);
        expect(random).not.toHaveBeenCalled();
        const awards = settleWeekly(real, 3, [], today, random);
        expect(awards[0]).toMatchObject({ type: 'weekly', points: 30, day: today, refKey: 'week:2026-11-09' });
        expect(box(awards)).toMatchObject({ type: 'blindbox', points: 0, refKey: 'box:2026-11-09' });
        expect(rewardMeta(box(awards).meta)).toEqual({ rulesVersion: 1, weekStart: '2026-11-09', stickerId: FUN_STICKERS[0].id, setCompleted: null });
        expect(settleWeekly(real, 3, awards, today, random)).toEqual([]);
        expect(random).toHaveBeenCalledTimes(1);
        expect(random).toHaveBeenCalledWith(36);
    });
    it('周中调低目标后按当前目标达标', () => {
        expect(settleWeekly(real, 4, [], today, () => 0)).toEqual([]);
        expect(settleWeekly(real, 3, [], today, () => 0).map(entry => entry.type)).toEqual(['weekly', 'blindbox']);
    });
    it('固定随机索引也不会抽到已有贴纸', () => {
        const existing = owned([FUN_STICKERS[0].id, FUN_STICKERS[1].id]);
        expect(rewardMeta(box(settleWeekly(real, 3, existing, today, () => 0)).meta).stickerId).toBe(FUN_STICKERS[2].id);
    });
    it('集齐一套加五十颗，同套奖励不重复', () => {
        const existing = owned(FUN_STICKERS.slice(0, 11).map(sticker => sticker.id));
        const awards = settleWeekly(real, 3, existing, today, () => 0);
        expect(rewardMeta(box(awards).meta)).toMatchObject({ stickerId: FUN_STICKERS[11].id, setCompleted: 'stationery' });
        expect(awards).toContainEqual(expect.objectContaining({ type: 'fun_set', points: 50, refKey: 'set:stationery' }));
        expect(settleWeekly(real, 3, [...existing, ...awards], today, () => 0)).toEqual([]);
    });
    it('三套全齐后盲盒发三十颗且不调用随机函数', () => {
        const random = vi.fn(() => 0);
        const awards = settleWeekly(real, 3, owned(FUN_STICKERS.map(sticker => sticker.id)), today, random);
        expect(box(awards).points).toBe(30);
        expect(rewardMeta(box(awards).meta)).toMatchObject({ stickerId: null, setCompleted: null });
        expect(random).not.toHaveBeenCalled();
        expect(awards.reduce((sum, entry) => sum + entry.points, 0)).toBe(60);
    });
    it('不回填上周，即使上周达标而本周未达标', () => {
        expect(settleWeekly(new Set(['2026-11-02', '2026-11-03', '2026-11-04']), 3, [], today, () => 0)).toEqual([]);
    });
});
