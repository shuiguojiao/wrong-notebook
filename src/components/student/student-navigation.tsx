"use client";

import Link from "next/link";
import { Camera } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { NAV_ITEMS } from "@/lib/app-navigation";
import { cn } from "@/lib/utils";

interface StudentNavigationProps {
    pathname: string;
    userName: string;
}

/** 两种界面风格共用同一套响应式导航，配色由语义令牌决定。 */
export function StudentNavigation({ pathname, userName }: StudentNavigationProps) {
    const { t } = useLanguage();
    return <nav aria-label={t.student.navigation} data-testid="student-navigation" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card text-card-foreground pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:right-auto md:w-[88px] md:flex-col md:items-center md:border-r md:border-t-0 md:pt-[max(1.75rem,env(safe-area-inset-top))] md:overflow-y-auto print:hidden">
        {/* 头像与“我的”导航项指向同一页；没有用户名时作为装饰，避免读屏出现两个同名链接。 */}
        <Link href="/me" aria-label={userName || undefined} aria-hidden={userName ? undefined : true} tabIndex={userName ? undefined : -1} title={userName || t.nav.me} className="mb-8 hidden size-12 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-lg font-semibold md:flex">
            {userName.slice(0, 1).toUpperCase() || t.nav.me.slice(0, 1)}
        </Link>
        <div className="grid min-h-16 w-full grid-cols-4 md:mb-6 md:shrink-0 md:flex md:flex-col md:gap-3 md:px-2">
            {NAV_ITEMS.map(item => {
                const active = item.match(pathname);
                const Icon = item.icon;
                return <Link key={item.key} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px] md:min-h-[72px]", active ? "font-bold text-foreground" : "text-muted-foreground")}>
                    <Icon className="size-5" aria-hidden="true" />
                    <span className={cn("px-1", active && "student-nav-highlight")}>{t.nav[item.key]}</span>
                </Link>;
            })}
        </div>
        <Link href="/?entry=photo#question-entry" onClick={() => { if (pathname === "/") window.dispatchEvent(new Event("focus-photo-entry")); }} className="mx-auto mb-6 mt-auto hidden size-14 shrink-0 flex-col items-center justify-center gap-1 rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-nb-primary hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring md:flex">
            <Camera className="size-5" aria-hidden="true" />{t.upload.camera}
        </Link>
    </nav>;
}
