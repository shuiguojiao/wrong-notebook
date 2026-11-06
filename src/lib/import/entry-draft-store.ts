const PREFIX = "question-entry:v1:";
export const ENTRY_DRAFT_EVENT = "question-entry-draft-change";
const fallback = new Map<string, string>();

/** 草稿仅存在当前标签页，按账号和入口隔离，不进入个人备份。 */
export function entryDraftKey(userId: string, scope: string): string {
    return `${PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(scope)}`;
}

export function readEntryDraft(key: string): string | null {
    if (fallback.has(key)) return fallback.get(key) ?? null;
    try { return sessionStorage.getItem(key); } catch { return null; }
}

export function writeEntryDraft(key: string, value: string | null): void {
    try {
        if (value === null) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, value);
        fallback.delete(key);
    } catch {
        if (value === null) fallback.delete(key);
        else fallback.set(key, value);
    }
    window.dispatchEvent(new Event(ENTRY_DRAFT_EVENT));
}

/** 退出或注销账号时清除本标签页的录入草稿。 */
export function clearEntryDrafts(): void {
    fallback.clear();
    try {
        for (const key of Object.keys(sessionStorage)) {
            if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
        }
    } catch { /* 浏览器可能禁用会话存储。 */ }
    window.dispatchEvent(new Event(ENTRY_DRAFT_EVENT));
}
