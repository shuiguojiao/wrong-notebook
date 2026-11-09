import { describe, expect, it } from 'vitest';
import { notebookDisplayNames } from '@/lib/notebook-display-names';

describe('复习首页错题本名称', () => {
    it.each([
        [['小明·数学', '小明·英语'], ['数学', '英语']],
        [['Alice-Math', 'Alice-English'], ['Math', 'English']],
        [['Alice Smith - Mathematics', 'Alice Smith - English'], ['Mathematics', 'English']],
        [['小明—数学', '小明_英语', '小明 语文'], ['数学', '英语', '语文']],
        [['小明 · 数学', '小明 · 英语'], ['数学', '英语']],
        [['小明·数学', '小明·数学拓展'], ['数学', '数学拓展']],
        [['小明·数学'], ['小明·数学']],
        [['数学', '英语'], ['数学', '英语']],
        [['小明·数学', '英语'], ['小明·数学', '英语']],
        [['小明·数学', '小红·英语'], ['小明·数学', '小红·英语']],
        [['小明·数学', '小明·'], ['小明·数学', '小明·']],
        [['小明·数学', '小明·  '], ['小明·数学', '小明·  ']],
        [['小明·数学', ''], ['小明·数学', '']],
        [['·数学', '·英语'], ['·数学', '·英语']],
        [['Math', 'Mathematics'], ['Math', 'Mathematics']],
        [[], []],
    ])('将 %j 显示为 %j', (names, expected) => {
        const original = [...names];
        expect(notebookDisplayNames(names)).toEqual(expected);
        expect(names).toEqual(original);
    });
});
