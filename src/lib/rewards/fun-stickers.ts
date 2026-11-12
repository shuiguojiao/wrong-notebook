export const FUN_STICKER_SETS = ['history', 'tech', 'hero'] as const;
export type FunStickerSetId = typeof FUN_STICKER_SETS[number];

const catalog: Record<FunStickerSetId, readonly string[]> = {
    history: ['terracotta', 'spartan', 'bronze-ding', 'beacon-tower', 'bamboo-slips', 'sinan', 'movable-type', 'pyramid', 'viking-ship', 'knight', 'colosseum', 'greek-temple'],
    tech: ['robot', 'chip', 'rocket', 'satellite', 'drone', 'robot-arm', 'vr-headset', 'gamepad', 'atom', 'dna', 'microscope', 'battery'],
    hero: ['bolt', 'mask', 'cape', 'gauntlet', 'jetpack', 'boots', 'comm-watch', 'power-core', 'force-shield', 'hero-base', 'morph-band', 'star-medal'],
};

export const FUN_STICKERS = FUN_STICKER_SETS.flatMap(setId => catalog[setId].map(name => ({
    id: `${setId}-${name}`, setId, nameKey: `${setId}-${name}`,
})));

// 旧目录固定为 a44dd33a 的套内顺序；只在读取时映射，不改写历史账目或备份。
const legacyCatalog: Record<string, readonly string[]> = {
    stationery: ['pencil', 'ruler', 'triangle', 'paperclip', 'crayon', 'scissors', 'notebook', 'pen', 'abacus', 'pushpin', 'folders', 'safety-pin'],
    animals: ['cat', 'dog', 'rabbit', 'panda', 'fox', 'koala', 'tiger', 'frog', 'penguin', 'owl', 'turtle', 'hedgehog'],
    space: ['rocket', 'planet', 'moon', 'star', 'comet', 'satellite', 'alien', 'earth', 'telescope', 'galaxy', 'ufo', 'sun'],
};
const legacySets: ReadonlyMap<string, FunStickerSetId> = new Map([
    ['stationery', 'history'], ['animals', 'tech'], ['space', 'hero'],
]);
const legacyStickers: ReadonlyMap<string, string> = new Map(Object.entries(legacyCatalog).flatMap(([setId, names]) =>
    names.map((name, index) => [`${setId}-${name}`, `${normalizeFunSetId(setId)}-${catalog[legacySets.get(setId)!][index]}`] as const)));

/** 已知旧套换成对应新套，未知编号保持原样。 */
export function normalizeFunSetId(id: string): string {
    return legacySets.get(id) ?? id;
}

/** 已知旧贴纸按套内顺序换成新编号，未知编号保持原样。 */
export function normalizeFunStickerId(id: string): string {
    return legacyStickers.get(id) ?? id;
}

export function funStickerArtSrc(id: string): string {
    return `/rewards/fun/${encodeURIComponent(normalizeFunStickerId(id))}.svg`;
}
