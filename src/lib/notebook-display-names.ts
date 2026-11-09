const LEADING_SEPARATORS = /^[·\-—_\s]+/u;

/** 仅在多个错题本共有完整前缀、且每个名称都保留非空后缀时省略。 */
export function notebookDisplayNames(names: readonly string[]): string[] {
    if (names.length < 2) return [...names];

    const trimmedNames = names.map(name => name.trim());
    let commonPrefix = trimmedNames[0];
    for (const name of trimmedNames.slice(1)) {
        while (commonPrefix && !name.startsWith(commonPrefix)) {
            commonPrefix = commonPrefix.slice(0, -1);
        }
    }

    // 优先取共同前缀后的分隔符，也允许不同名称使用不同分隔符。
    const boundary = trimmedNames.every(name => LEADING_SEPARATORS.test(name.slice(commonPrefix.length)))
        ? commonPrefix.length
        : (commonPrefix.match(/^.*[·\-—_\s]+/u)?.[0].length ?? 0);
    const shortened = trimmedNames.map(name => name.slice(boundary).replace(LEADING_SEPARATORS, '').trim());
    const prefix = commonPrefix.slice(0, boundary).replace(/[·\-—_\s]+/gu, '');
    if (!prefix || shortened.some(name => !name)) return [...names];
    return shortened;
}
