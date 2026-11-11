"use client";

import { useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FocusShellContext } from "@/contexts/FocusShellContext";
import { useLanguage } from "@/contexts/LanguageContext";

/** 仅在同源的错题本或题目详情有可返回历史时，返回进入核对前的位置。 */
function canReturn(previousPathname?: string | null) {
    if (typeof window === "undefined" || window.history.length <= 1) return false;
    const source = previousPathname ?? document.referrer;
    if (!source) return false;
    try {
        const url = new URL(source, window.location.origin);
        return url.origin === window.location.origin
            && /^(?:\/notebooks(?:\/[^/]+)?|\/error-items\/[^/]+)\/?$/.test(url.pathname);
    } catch { return false; }
}

export function ChecksEmptyState() {
    const { t } = useLanguage();
    const router = useRouter();
    const shell = useContext(FocusShellContext);
    // 空队列加载完成后才挂载，固定本次入口，避免后续渲染改变返回含义。
    const [returnToSource] = useState(() => canReturn(shell?.previousPathname));
    return <section aria-live="polite" className="space-y-6 rounded-xl border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold">{t.checks.done}</h1>
        <p className="text-sm text-muted-foreground">{t.checks.emptyHint}</p>
        <Button className="min-h-11" onClick={() => returnToSource ? router.back() : router.push("/")}>
            {returnToSource ? t.common.back : t.student.backToToday}
        </Button>
    </section>;
}
