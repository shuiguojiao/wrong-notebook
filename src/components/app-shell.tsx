"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { StudentNavigation } from "@/components/student/student-navigation";
import { PendingUploads } from "@/components/upload-zone/pending-uploads";
import { FocusShellContext } from "@/contexts/FocusShellContext";
import { isBarePath, isFocusPath } from "@/lib/app-navigation";
import { useSetupRedirect } from "@/lib/hooks/use-setup-redirect";

interface AppShellProps { children: ReactNode }

/** 学生端外壳：平板与桌面侧栏、手机四标签，不提供旧顶栏。 */
export function AppShell({ children }: AppShellProps) {
    const pathname = usePathname() || "/";
    const { data: session, status } = useSession();
    const [releasedFocusPath, setReleasedFocusPath] = useState<string | null>(null);
    const [previousPathname, setPreviousPathname] = useState(pathname);
    // 路由切换时在渲染导航前复位，避免旧空态影响再次进入同一路径的首屏。
    if (previousPathname !== pathname) {
        setPreviousPathname(pathname);
        setReleasedFocusPath(null);
    }
    const isBare = isBarePath(pathname);
    useSetupRedirect(session?.user?.role === "admin" && !isBare);
    const showShell = !isBare && !isFocusPath(pathname, releasedFocusPath === pathname) && status !== "unauthenticated";
    const userName = session?.user?.name || session?.user?.email || "";
    return <FocusShellContext.Provider value={{ pathname, setReleasedFocusPath }}>
        <div className={showShell ? "student-shell min-h-screen md:pl-[88px] print:pl-0" : undefined}>
            {showShell && <StudentNavigation pathname={pathname} userName={userName} sessionLoading={status === "loading"} />}
            <div className={showShell ? "pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 print:pb-0" : undefined}>
                {showShell && <PendingUploads />}
                {children}
            </div>
        </div>
    </FocusShellContext.Provider>;
}
