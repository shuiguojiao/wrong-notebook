import type { LucideIcon } from "lucide-react";
import { BookOpen, House, Star, UserRound } from "lucide-react";
import type { translations } from "@/lib/translations";

/** 导航项 key：对应 translations 中 t.nav 的翻译 key */
export type NavKey = keyof typeof translations.en.nav;

export interface NavItem {
    key: NavKey;
    href: string;
    icon: LucideIcon;
    match: (pathname: string) => boolean;
}

/** 登录、注册与打印页不显示导航 */
export const BARE_PATHS: RegExp[] = [/^\/login/, /^\/register/, /^\/setup/, /^\/print-preview/, /^\/exams\/[^/]+\/print/];

/** 侧栏与手机底栏共用四个入口。 */
export const NAV_ITEMS: NavItem[] = [
    { key: "home", href: "/", icon: House, match: (p) => p === "/" || /^\/review(?:\/|$)/.test(p) },
    {
        key: "notebooks", href: "/notebooks", icon: BookOpen,
        match: (p) => /^\/(notebooks|error-items|practice)(?:\/|$)/.test(p),
    },
    { key: "collection", href: "/collection", icon: Star, match: (p) => /^\/collection(?:\/|$)/.test(p) },
    {
        key: "me", href: "/me", icon: UserRound,
        match: (p) => /^\/(me|history|stats|exams|import-tasks|import-batches|tags|admin|checks)(?:\/|$)/.test(p),
    },
];

/** 品牌配置：fork 项目可替换图标路径 */
export const APP_BRAND = { iconSrc: "/icons/icon.png" } as const;

/** 当前路径是否不显示导航 */
export function isBarePath(pathname: string): boolean {
    return BARE_PATHS.some((pattern) => pattern.test(pathname));
}

/** 专注路径从加载起隐藏导航，页面确定为空队列或无内容异常时才释放。 */
export function isFocusPath(pathname: string, released = false): boolean {
    return !released && /^(?:\/review\/session|\/checks|\/exams\/[^/]+\/attempts\/[^/]+)\/?$/.test(pathname.split(/[?#]/, 1)[0]);
}

/** 返回第一个 match 的导航项 key；无匹配返回 null */
export function findActiveNavKey(pathname: string): NavKey | null {
    const item = NAV_ITEMS.find((nav) => nav.match(pathname));
    return item ? item.key : null;
}
