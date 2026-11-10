import { describe, expect, it } from "vitest";
import { APP_BRAND, BARE_PATHS, NAV_ITEMS, findActiveNavKey, isBarePath, isFocusPath } from "@/lib/app-navigation";
import { translations } from "@/lib/translations";

describe("app-navigation", () => {
    it("BARE_PATHS 匹配无导航路径", () => {
        expect(isBarePath("/login")).toBe(true);
        expect(isBarePath("/login?callbackUrl=%2F")).toBe(true);
        expect(isBarePath("/register")).toBe(true);
        expect(isBarePath("/setup")).toBe(true);
        expect(isBarePath("/setup/abc")).toBe(true);
        expect(isBarePath("/print-preview")).toBe(true);
        expect(isBarePath("/exams/abc/print")).toBe(true);
        expect(isBarePath("/exams/123/print")).toBe(true);
    });

    it("BARE_PATHS 不匹配正常页面", () => {
        expect(isBarePath("/")).toBe(false);
        expect(isBarePath("/notebooks")).toBe(false);
        expect(isBarePath("/exams")).toBe(false);
        expect(isBarePath("/exams/abc")).toBe(false);
        expect(isBarePath("/stats")).toBe(false);
    });

    it("BARE_PATHS 前缀匹配，未锚定结尾（保持原行为）", () => {
        expect(isBarePath("/exams/abc/print-other")).toBe(true);
        expect(isBarePath("/print-preview-other")).toBe(true);
    });

    it.each(['/review/session', '/review/session/', '/review/session?subjectId=math', '/review/session#answer', '/checks', '/checks/', '/checks?from=import'])('专注路径 %s 默认隐藏全局入口，主动释放后显示', path => {
        expect(isFocusPath(path)).toBe(true);
        expect(isFocusPath(path, false)).toBe(true);
        expect(isFocusPath(path, true)).toBe(false);
    });
    it.each(['/', '/review', '/review/session-other', '/review/session/history', '/checks-history', '/checks/history', '/practice', '/login'])('普通或相似前缀 %s 不误判为专注路径', path => {
        expect(isFocusPath(path)).toBe(false);
        expect(isFocusPath(path, false)).toBe(false);
        expect(isFocusPath(path, true)).toBe(false);
    });

    it("findActiveNavKey 高亮规则", () => {
        expect(findActiveNavKey("/")).toBe("home");
        expect(findActiveNavKey("/notebooks")).toBe("notebooks");
        expect(findActiveNavKey("/notebooks/abc")).toBe("notebooks");
        expect(findActiveNavKey("/error-items/x")).toBe("notebooks");
        expect(findActiveNavKey("/practice/y")).toBe("notebooks");
        expect(findActiveNavKey("/review")).toBe("me");
        expect(findActiveNavKey("/review/today")).toBe("me");
        expect(findActiveNavKey("/stats")).toBe("me");
        expect(findActiveNavKey("/tags")).toBe("me");
        expect(findActiveNavKey("/exams")).toBe("me");
        expect(findActiveNavKey("/exams/1")).toBe("me");
        expect(findActiveNavKey("/import-tasks" )).toBe("me");
        expect(findActiveNavKey("/collection")).toBe("collection");
        expect(findActiveNavKey("/me")).toBe("me");
        expect(NAV_ITEMS.map(item => item.href)).toEqual(["/", "/notebooks", "/collection", "/me"]);
        expect(findActiveNavKey("/unknown")).toBeNull();
    });

    it("每个导航项 key 都存在于中英 translations 的 nav 中", () => {
        const enNav = translations.en.nav;
        const zhNav = translations.zh.nav;
        for (const item of NAV_ITEMS) {
            expect(enNav[item.key]).toBeDefined();
            expect(zhNav[item.key]).toBeDefined();
        }
    });

    it("导航项 icon 与 href 均存在", () => {
        for (const item of NAV_ITEMS) {
            expect(item.href).toBeTruthy();
            expect(item.icon).toBeTruthy();
        }
    });

    it("APP_BRAND 默认图标路径", () => {
        expect(APP_BRAND.iconSrc).toBe("/icons/icon.png");
    });

    it("BARE_PATHS 与 isBarePath 行为一致", () => {
        const paths = ["/", "/login", "/print-preview", "/exams/1/print", "/notebooks", "/stats", "/unknown"];
        for (const p of paths) {
            expect(isBarePath(p)).toBe(BARE_PATHS.some((r) => r.test(p)));
        }
    });
});
