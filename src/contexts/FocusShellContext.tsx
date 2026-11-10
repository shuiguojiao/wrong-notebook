"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

interface FocusShellValue {
    pathname: string;
    setReleasedFocusPath: Dispatch<SetStateAction<string | null>>;
}

export const FocusShellContext = createContext<FocusShellValue | null>(null);

/** 专注路径默认隐藏导航；仅空队列或无可作答内容的异常释放专注，卸载时撤回释放。 */
export function useReleaseFocusShell(release: boolean) {
    const shell = useContext(FocusShellContext);
    const pathname = shell?.pathname;
    // 旧页面在路由过渡期间可能仍挂载，不能把释放状态上报到新路径。
    const [pagePathname] = useState(pathname);
    const setReleasedFocusPath = shell?.setReleasedFocusPath;
    useEffect(() => {
        if (!release || !pathname || pathname !== pagePathname || !setReleasedFocusPath) return;
        setReleasedFocusPath(pathname);
        return () => setReleasedFocusPath(current => current === pathname ? null : current);
    }, [release, pathname, pagePathname, setReleasedFocusPath]);
}
