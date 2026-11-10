"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BookOpen, CalendarCheck, ListChecks, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { HomeStat } from "@/lib/hooks/use-home-stats";

interface HomeHeroProps {
    notebookCount: HomeStat;
    itemCount: HomeStat;
    dueCount: HomeStat;
    /** 从错题本页进入时的目标错题本名称 */
    targetNotebook?: string;
}

const subscribeNothing = () => () => {};

interface StatTileProps {
    href: string;
    icon: LucideIcon;
    label: string;
    stat: HomeStat;
}

function StatTile({ href, icon: Icon, label, stat }: StatTileProps) {
    const { t } = useLanguage();
    const content = <>
        <div className="flex items-center gap-1.5 text-xs text-white/75">
            <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
        </div>
        <div className="mt-1 flex h-8 items-center text-2xl font-bold tabular-nums" aria-live="polite" aria-busy={stat.status === "loading"}>
            {stat.status === "loading" ? <>
                <span aria-hidden="true" className="h-6 w-12 rounded bg-white/25 motion-safe:animate-pulse" />
                <span className="sr-only">{t.common.loading}</span>
            </> : stat.status === "success" ? stat.value : <>
                <span aria-hidden="true">–</span>
                <span className="sr-only">{t.home.statFailed}</span>
                <span className="ml-2 text-xs font-normal underline">{t.review.retry}</span>
            </>}
        </div>
    </>;
    const className = "min-w-0 rounded-xl bg-white/15 px-4 py-3 text-left backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
    return stat.status === "error"
        ? <button type="button" className={className} onClick={stat.retry} aria-label={`${label} · ${t.home.statFailed} · ${t.review.retry}`}>{content}</button>
        : <Link href={href} className={className}>{content}</Link>;
}

/** 首页顶部欢迎区：问候语 + 错题本/错题数量 + 今日待复习 */
export function HomeHero({ notebookCount, itemCount, dueCount, targetNotebook }: HomeHeroProps) {
    const { t, language } = useLanguage();
    const { data: session } = useSession();
    // 问候语依赖本地时间，服务端渲染时返回 null，避免两端渲染不一致
    const hour = useSyncExternalStore(subscribeNothing, () => new Date().getHours(), () => null);

    const greeting = hour === null
        ? t.common.welcome.replace(/[，,\s]+$/, "")
        : hour < 12 ? t.home.greetingMorning
            : hour < 18 ? t.home.greetingAfternoon
                : t.home.greetingEvening;
    const name = session?.user?.name || session?.user?.email || "";

    return (
        <section className="@container relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 p-5 text-white shadow-lg shadow-indigo-500/20 md:p-7">
            <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-fuchsia-300/20 blur-2xl" />

            <div className="relative flex flex-col gap-5 @2xl:flex-row @2xl:items-end @2xl:justify-between">
                <div className="space-y-1.5">
                    <h1 className="text-xl font-bold tracking-tight md:text-2xl">
                        {greeting}{name && `${language === "zh" ? "，" : ", "}${name}`}
                    </h1>
                    <p className="max-w-md text-sm text-white/80">{t.home.heroSubtitle}</p>
                    {targetNotebook && (
                        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                            <Target className="h-3.5 w-3.5" />
                            {t.home.targetNotebook.replace("{name}", targetNotebook)}
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-3 gap-3 @2xl:w-96">
                    <StatTile href="/notebooks" icon={BookOpen} label={t.home.notebookCount} stat={notebookCount} />
                    <StatTile href="/notebooks" icon={ListChecks} label={t.home.itemCount} stat={itemCount} />
                    <StatTile href="/review" icon={CalendarCheck} label={t.student.dueToday} stat={dueCount} />
                </div>
            </div>
        </section>
    );
}
