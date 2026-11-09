/** 仅判断题干是否显式引用图形，不推断是否真的缺图。 */
export function questionReferencesFigure(text: string): boolean {
    return /如图|下图|图中|右图|左图|上图|附图|图示|图所示|图\s*[（(]?\s*[一二三四五六七八九十\d]+\s*[)）]?|\b(?:figure|diagram)\b/i.test(text);
}
