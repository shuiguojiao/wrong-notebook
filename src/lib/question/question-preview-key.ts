import { formatDateTime } from "@/lib/date-time";

interface GroupableQuestion {
    createdAt: string;
    source?: string | null;
}

/** 仅在当前页内按应用时区的导入日期和来源首段分组，保留列表原有顺序。 */
export function questionGroupKey(item: GroupableQuestion, timeZone: string): { key: string; date: string; source: string } {
    const date = formatDateTime(item.createdAt, "yyyy-MM-dd", timeZone);
    const source = item.source?.split(/[｜；]/, 1)[0].trim() || "";
    return { key: JSON.stringify([date, source]), date, source };
}

export function groupQuestions<T extends GroupableQuestion>(items: readonly T[], timeZone: string) {
    const groups = new Map<string, ReturnType<typeof questionGroupKey> & { items: T[] }>();
    for (const item of items) {
        const group = questionGroupKey(item, timeZone);
        const existing = groups.get(group.key);
        if (existing) existing.items.push(item);
        else groups.set(group.key, { ...group, items: [item] });
    }
    return [...groups.values()];
}

/** 提取完整的开头说明，不按任意字符前缀裁切，避免截断拼音、公式或具体题目条件。 */
function openingInstruction(text: string): string | null {
    const match = text.match(/^([\s\S]{4,240}?(?:[。！？!?：:]|\.(?=\s)|\n))([*_`~]*\s*)/);
    if (!match) return null;
    const prefix = match[0];
    if (!/根据|阅读|完成|填写|填空|写出|选择|解答|计算|补全|fill|complete|read|choose|solve|calculate/i.test(prefix)) return null;
    // 含公式的共同条件仍属于题目，不能当成通用说明删除。
    if (/\$|\\\(|\\\[/.test(prefix) || !text.slice(prefix.length).trim()) return null;
    return prefix;
}

/** 为同组题目生成预览：只省略至少两道题共有的完整说明，原始 Markdown 和公式保持原样。 */
export function questionPreviewKeys(texts: readonly (string | null | undefined)[]): string[] {
    const normalized = texts.map(text => text?.replace(/\r\n/g, "\n").trim() || "");
    const prefixes = normalized.map(openingInstruction);
    const counts = new Map<string, number>();
    for (const prefix of prefixes) if (prefix) counts.set(prefix.trim(), (counts.get(prefix.trim()) ?? 0) + 1);
    return normalized.map((text, index) => {
        const prefix = prefixes[index];
        return prefix && (counts.get(prefix.trim()) ?? 0) > 1 ? text.slice(prefix.length).trim() : text;
    });
}
