"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ZodType } from "zod";
import { ENTRY_DRAFT_EVENT, readEntryDraft, writeEntryDraft } from "@/lib/import/entry-draft-store";

function subscribe(listener: () => void) {
    window.addEventListener(ENTRY_DRAFT_EVENT, listener);
    return () => window.removeEventListener(ENTRY_DRAFT_EVENT, listener);
}

/** 同步保存输入，刷新后恢复；服务端首屏使用空草稿，避免水合差异。 */
export function useEntryDraft<T>(key: string | undefined, initial: T, schema: ZodType<T>): [T, Dispatch<SetStateAction<T>>] {
    const [local, setLocal] = useState(initial);
    const read = useCallback(() => key ? readEntryDraft(key) : null, [key]);
    const raw = useSyncExternalStore(subscribe, read, () => null);
    const parse = useCallback((value: string | null): T => {
        try {
            const result = schema.safeParse(value === null ? initial : JSON.parse(value));
            return result.success ? result.data : initial;
        } catch { return initial; }
    }, [initial, schema]);
    const saved = useMemo(() => parse(raw), [parse, raw]);
    const setValue: Dispatch<SetStateAction<T>> = useCallback((next) => {
        if (!key) { setLocal(next); return; }
        const value = typeof next === "function" ? (next as (current: T) => T)(parse(readEntryDraft(key))) : next;
        writeEntryDraft(key, JSON.stringify(value));
    }, [key, parse]);
    return [key ? saved : local, setValue];
}
