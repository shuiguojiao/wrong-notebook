export const FUN_STICKER_SETS = ['stationery', 'animals', 'space'] as const;
export type FunStickerSetId = typeof FUN_STICKER_SETS[number];

const catalog: Record<FunStickerSetId, readonly (readonly [string, string])[]> = {
    stationery: [['pencil', '✏️'], ['ruler', '📏'], ['triangle', '📐'], ['paperclip', '📎'], ['crayon', '🖍️'], ['scissors', '✂️'],
        ['notebook', '📒'], ['pen', '🖊️'], ['abacus', '🧮'], ['pushpin', '📌'], ['folders', '🗂️'], ['safety-pin', '🧷']],
    animals: [['cat', '🐱'], ['dog', '🐶'], ['rabbit', '🐰'], ['panda', '🐼'], ['fox', '🦊'], ['koala', '🐨'],
        ['tiger', '🐯'], ['frog', '🐸'], ['penguin', '🐧'], ['owl', '🦉'], ['turtle', '🐢'], ['hedgehog', '🦔']],
    space: [['rocket', '🚀'], ['planet', '🪐'], ['moon', '🌙'], ['star', '⭐'], ['comet', '☄️'], ['satellite', '🛰️'],
        ['alien', '👽'], ['earth', '🌍'], ['telescope', '🔭'], ['galaxy', '🌌'], ['ufo', '🛸'], ['sun', '🌞']],
};

export const FUN_STICKERS = FUN_STICKER_SETS.flatMap(setId => catalog[setId].map(([name, emoji]) => ({
    id: `${setId}-${name}`, setId, emoji, nameKey: `${setId}-${name}`,
})));
