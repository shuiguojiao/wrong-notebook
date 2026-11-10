"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { DEFAULT_UI_STYLE, readLastUiStyle, readUiStyle, resolveUiStyle, writeLastUiStyle, writeUiStyle } from "@/lib/ui-style";
import type { UiStyle } from "@/lib/ui-style";

interface UiStyleContextValue {
    preference: UiStyle;
    style: UiStyle;
    setPreference: (style: UiStyle) => void;
}

interface UiStyleProviderProps {
    children: ReactNode;
}

const UiStyleContext = createContext<UiStyleContextValue>({
    preference: DEFAULT_UI_STYLE,
    style: DEFAULT_UI_STYLE,
    setPreference: () => undefined,
});

/** 每个 Provider 独立保留会话缓存，存储被禁用时切换账号也不会串值。 */
function createPreferenceStore() {
    const values = new Map<string | null, UiStyle>();
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((listener) => listener());
    return {
        values,
        notify,
        subscribe(listener: () => void) {
            listeners.add(listener);
            const handleStorage = (event: StorageEvent) => {
                if (event.key !== null && !event.key.startsWith("ui-style:")) return;
                values.clear();
                notify();
            };
            window.addEventListener("storage", handleStorage);
            return () => {
                listeners.delete(listener);
                window.removeEventListener("storage", handleStorage);
            };
        },
    };
}

export function UiStyleProvider({ children }: UiStyleProviderProps) {
    const { data: session, status } = useSession();
    const pathname = usePathname() ?? "/";
    const userId = status === "authenticated" ? session?.user?.id ?? null : null;
    const [store] = useState(createPreferenceStore);
    const readPreference = useCallback(() => {
        if (status === "loading") return readLastUiStyle();
        return store.values.get(userId) ?? (userId ? readUiStyle(userId) : readLastUiStyle());
    }, [status, store, userId]);
    const preference = useSyncExternalStore(store.subscribe, readPreference, () => DEFAULT_UI_STYLE);
    const style = resolveUiStyle(preference, pathname);

    useEffect(() => {
        // 会话确定前沿用首屏脚本的缓存；强制简洁路由仍立即生效。
        if (status === "loading") {
            document.documentElement.dataset.ui = resolveUiStyle(readLastUiStyle(), pathname);
            return;
        }
        const current = readPreference();
        document.documentElement.dataset.ui = resolveUiStyle(current, pathname);
        // 只记住用户选择，管理或打印路由的临时覆盖不写回偏好。
        writeLastUiStyle(current);
    }, [pathname, preference, readPreference, status]);

    const setPreference = useCallback((next: UiStyle) => {
        if (status === "loading") return;
        store.values.set(userId, next);
        if (userId) writeUiStyle(userId, next);
        else writeLastUiStyle(next);
        store.notify();
    }, [status, store, userId]);

    const value = useMemo(() => ({ preference, style, setPreference }), [preference, style, setPreference]);
    return <UiStyleContext.Provider value={value}>{children}</UiStyleContext.Provider>;
}

export function useUiStyle(): UiStyleContextValue {
    return useContext(UiStyleContext);
}
