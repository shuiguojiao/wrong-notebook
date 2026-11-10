/** 界面风格仅保存在本机浏览器；与账号同步的明暗主题相互独立。 */
export type UiStyle = "notebook" | "simple";

export const DEFAULT_UI_STYLE: UiStyle = "notebook";
export const UI_STYLE_LAST_KEY = "ui-style:last";
const SIMPLE_UI_ROUTE_PATTERN = /^\/(?:admin(?:\/|$)|print-preview(?:\/|$)|exams\/[^/]+\/print\/?$)/;

export function isUiStyle(value: unknown): value is UiStyle {
    return value === "notebook" || value === "simple";
}

export function getUiStyleStorageKey(userId: string): string {
    return `ui-style:${userId}`;
}

export function readLastUiStyle(): UiStyle {
    try {
        const saved = localStorage.getItem(UI_STYLE_LAST_KEY);
        return isUiStyle(saved) ? saved : DEFAULT_UI_STYLE;
    } catch {
        return DEFAULT_UI_STYLE;
    }
}

/** 登录账号缺少缓存时取默认值，不能借用上一个账号的首屏缓存。 */
export function readUiStyle(userId: string): UiStyle {
    try {
        const saved = localStorage.getItem(getUiStyleStorageKey(userId));
        return isUiStyle(saved) ? saved : DEFAULT_UI_STYLE;
    } catch {
        return DEFAULT_UI_STYLE;
    }
}

export function writeLastUiStyle(style: UiStyle): void {
    try {
        localStorage.setItem(UI_STYLE_LAST_KEY, style);
    } catch {
        // 存储不可用时由 Context 保留本次会话的选择。
    }
}

export function writeUiStyle(userId: string, style: UiStyle): void {
    try {
        localStorage.setItem(getUiStyleStorageKey(userId), style);
    } catch {
        // 单个账号写入失败也不妨碍尝试更新首屏缓存。
    }
    writeLastUiStyle(style);
}

export function isSimpleUiRoute(pathname: string): boolean {
    return SIMPLE_UI_ROUTE_PATTERN.test(pathname);
}

export function resolveUiStyle(style: UiStyle, pathname: string): UiStyle {
    return isSimpleUiRoute(pathname) ? "simple" : style;
}

// 首屏复用静态路由表达式，不依赖编译后的函数源码，也不拼入任何用户输入。
export const UI_STYLE_INIT_SCRIPT = `(function(){var s="notebook";try{var p=localStorage.getItem("ui-style:last");if(p==="notebook"||p==="simple")s=p}catch(e){}document.documentElement.dataset.ui=${SIMPLE_UI_ROUTE_PATTERN}.test(window.location.pathname)?"simple":s})();`;
