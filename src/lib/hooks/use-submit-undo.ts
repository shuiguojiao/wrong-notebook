"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

/** 撤回窗口与判题请求共用生命周期，取消后即使请求忽略 signal 也不能写回。 */
export function useSubmitUndo() {
    const request = useRef<AbortController | null>(null);
    const expiry = useRef(0);
    const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [canUndo, setCanUndo] = useState(false);
    const dismiss = useCallback(() => {
        expiry.current = 0;
        if (timeout.current) clearTimeout(timeout.current);
        setCanUndo(false);
    }, []);
    useEffect(() => () => {
        request.current?.abort();
        if (timeout.current) clearTimeout(timeout.current);
    }, []);
    const begin = () => {
        request.current?.abort();
        dismiss();
        const controller = new AbortController();
        request.current = controller;
        expiry.current = Date.now() + 3000;
        setCanUndo(true);
        timeout.current = setTimeout(dismiss, 3000);
        return controller;
    };
    const cancel = (force = false) => {
        if (!force && Date.now() >= expiry.current) return false;
        request.current?.abort();
        dismiss();
        return true;
    };
    return { begin, cancel, dismiss, canUndo };
}
