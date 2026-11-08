"use client";

import { useState, useSyncExternalStore } from 'react';

const KEY = 'handwriting:pen-detected';
function detected() {
    try { return localStorage.getItem(KEY) === 'true'; } catch { return false; }
}
function subscribe(callback: () => void) {
    window.addEventListener(KEY, callback);
    return () => window.removeEventListener(KEY, callback);
}
/** 只保存设备是否用过笔，不保存笔迹；用户本次手动关闭后不会被再次落笔覆盖。 */
export function usePencilPreference() {
    const hasPen = useSyncExternalStore(subscribe, detected, () => false);
    const [override, setOverride] = useState<boolean | null>(null);
    const [seen, setSeen] = useState(false);
    function onPen() {
        if (!hasPen && !seen) {
            setSeen(true); setOverride(true);
            try { localStorage.setItem(KEY, 'true'); } catch { /* 存储不可用时在本次画布内记住检测结果。 */ }
            window.dispatchEvent(new Event(KEY));
        }
    }
    return { pencilOnly: override ?? hasPen, setPencilOnly: setOverride, onPen };
}
