import { describe, expect, it } from 'vitest';
import { FUN_STICKERS, FUN_STICKER_SETS, funStickerArtSrc, normalizeFunSetId, normalizeFunStickerId } from '@/lib/rewards/fun-stickers';
import { funRewardMeta, rewardMeta } from '@/lib/rewards/rules';
import type { Award } from '@/lib/rewards/rules';
import { settleWeekly } from '@/lib/rewards/weekly';

// 固定抄自 a44dd33a，不依赖实现中的旧目录，防止顺序同时改错。
const legacySets = [
    ['stationery', ['pencil', 'ruler', 'triangle', 'paperclip', 'crayon', 'scissors', 'notebook', 'pen', 'abacus', 'pushpin', 'folders', 'safety-pin']],
    ['animals', ['cat', 'dog', 'rabbit', 'panda', 'fox', 'koala', 'tiger', 'frog', 'penguin', 'owl', 'turtle', 'hedgehog']],
    ['space', ['rocket', 'planet', 'moon', 'star', 'comet', 'satellite', 'alien', 'earth', 'telescope', 'galaxy', 'ufo', 'sun']],
] as const;
const newSets = [
    ['terracotta', 'spartan', 'bronze-ding', 'beacon-tower', 'bamboo-slips', 'sinan', 'movable-type', 'pyramid', 'viking-ship', 'knight', 'colosseum', 'greek-temple'],
    ['robot', 'chip', 'rocket', 'satellite', 'drone', 'robot-arm', 'vr-headset', 'gamepad', 'atom', 'dna', 'microscope', 'battery'],
    ['bolt', 'mask', 'cape', 'gauntlet', 'jetpack', 'boots', 'comm-watch', 'power-core', 'force-shield', 'hero-base', 'morph-band', 'star-medal'],
];
const real = new Set(['2026-11-09', '2026-11-10', '2026-11-11']);

describe('趣味贴纸历史编号兼容', () => {
    it('全部 36 张按指定顺序一一对应，无遗漏、无重复', () => {
        expect(FUN_STICKER_SETS).toEqual(['history', 'tech', 'hero']);
        const expected = newSets.flatMap((names, index) => names.map(name => `${FUN_STICKER_SETS[index]}-${name}`));
        const mapped = legacySets.flatMap(([set, names], index) => {
            expect(normalizeFunSetId(set)).toBe(FUN_STICKER_SETS[index]);
            return names.map(name => normalizeFunStickerId(`${set}-${name}`));
        });
        expect(mapped).toEqual(expected);
        expect(mapped).toEqual(FUN_STICKERS.map(sticker => sticker.id));
        expect(new Set(mapped).size).toBe(36);
    });
    it('新编号、未知编号原样返回，重复规范化不改变结果', () => {
        for (const id of [...FUN_STICKERS.map(sticker => sticker.id), 'unknown', 'animals-future', 'space', '', '__proto__']) {
            expect(normalizeFunStickerId(id)).toBe(id);
        }
        for (const id of [...FUN_STICKER_SETS, 'unknown', '', '__proto__']) expect(normalizeFunSetId(id)).toBe(id);
        expect(normalizeFunStickerId(normalizeFunStickerId('stationery-pencil'))).toBe('history-terracotta');
        expect(funStickerArtSrc('animals-cat')).toBe('/rewards/fun/tech-robot.svg');
    });
    it('账目读取统一规范化两种编号，不修改原始 JSON，空值与未知字段保留', () => {
        const raw = '{"rulesVersion":1,"stickerId":"space-star","setCompleted":"space","extra":true}';
        expect(funRewardMeta(raw)).toEqual({ rulesVersion: 1, stickerId: 'hero-gauntlet', setCompleted: 'hero', extra: true });
        expect(rewardMeta(raw)).toEqual(JSON.parse(raw));
        expect(JSON.parse(raw)).toMatchObject({ stickerId: 'space-star', setCompleted: 'space' });
        expect(funRewardMeta('{"stickerId":null,"setCompleted":null}')).toEqual({ stickerId: null, setCompleted: null });
        expect(funRewardMeta('{"stickerId":"future-new","setCompleted":"future"}')).toEqual({ stickerId: 'future-new', setCompleted: 'future' });
    });
    it.each(legacySets)('已有 %s 的集齐奖励时，对应新套不会重复发豆', (set, names) => {
        const existing: Award[] = names.slice(0, 11).map((name, index) => ({ day: '2026-10-01', type: 'blindbox', points: 0,
            refKey: `box:old-${index}`, meta: JSON.stringify({ stickerId: `${set}-${name}` }) }));
        existing.push({ day: '2026-10-01', type: 'fun_set', points: 50, refKey: `set:${set}`, meta: null });
        const start = legacySets.findIndex(([id]) => id === set) * 12;
        const random = (size: number) => { expect(size).toBe(25); return start; };
        const awards = settleWeekly(real, 3, existing, '2026-11-12', random);
        expect(rewardMeta(awards.find(entry => entry.type === 'blindbox')!.meta)).toMatchObject({
            stickerId: FUN_STICKERS[start + 11].id, setCompleted: FUN_STICKERS[start].setId,
        });
        expect(awards.filter(entry => entry.type === 'fun_set')).toEqual([]);
        expect(existing.at(-1)?.refKey).toBe(`set:${set}`);
    });
    it('36 张旧贴纸全齐后不再抽新贴纸，盲盒按原规则发豆', () => {
        const entries: Award[] = legacySets.flatMap(([set, names]) => names.map(name => ({ day: '2026-10-01', type: 'blindbox', points: 0,
            refKey: `box:${set}-${name}`, meta: JSON.stringify({ stickerId: `${set}-${name}` }) })));
        const awards = settleWeekly(real, 3, entries, '2026-11-12', () => { throw new Error('全齐时不应抽签'); });
        expect(awards.find(entry => entry.type === 'blindbox')).toMatchObject({ points: 30 });
        expect(awards.filter(entry => entry.type === 'fun_set')).toEqual([]);
    });
});
