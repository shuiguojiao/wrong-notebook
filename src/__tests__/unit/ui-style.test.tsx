import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    pathname: "/settings",
    session: { status: "authenticated", data: { user: { id: "alice" } } },
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("next-auth/react", () => ({ useSession: () => mocks.session }));

import { UiStyleProvider, useUiStyle } from "@/contexts/UiStyleContext";
import { DEFAULT_UI_STYLE, getUiStyleStorageKey, isSimpleUiRoute, isUiStyle, readLastUiStyle, readUiStyle, resolveUiStyle, UI_STYLE_INIT_SCRIPT, UI_STYLE_LAST_KEY, writeUiStyle } from "@/lib/ui-style";

beforeEach(() => {
    // 公共 setup 使用 vi.fn 模拟存储；这里每例独立，避免异常实现跨用例残留。
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => { saved.set(key, value); },
    });
    mocks.pathname = "/settings";
    mocks.session = { status: "authenticated", data: { user: { id: "alice" } } };
    delete document.documentElement.dataset.ui;
});

afterEach(() => {
    window.history.replaceState({}, "", "/");
    delete document.documentElement.dataset.ui;
    vi.unstubAllGlobals();
});

describe("界面风格存储", () => {
    it("默认手账，仅接受两种风格，非法缓存回退默认值", () => {
        expect(DEFAULT_UI_STYLE).toBe("notebook");
        expect(isUiStyle("notebook")).toBe(true);
        expect(isUiStyle("simple")).toBe(true);
        for (const invalid of [null, undefined, "dark", "", 1]) expect(isUiStyle(invalid)).toBe(false);
        expect(readUiStyle("alice")).toBe("notebook");
        localStorage.setItem(getUiStyleStorageKey("alice"), "dark");
        localStorage.setItem(UI_STYLE_LAST_KEY, "dark");
        expect(readUiStyle("alice")).toBe("notebook");
        expect(readLastUiStyle()).toBe("notebook");
    });

    it("按账号读写，并独立保存最近风格；新账号不借用最近值", () => {
        writeUiStyle("alice", "simple");
        expect(localStorage.getItem("ui-style:alice")).toBe("simple");
        expect(localStorage.getItem(UI_STYLE_LAST_KEY)).toBe("simple");
        expect(readUiStyle("bob")).toBe("notebook");
        writeUiStyle("bob", "notebook");
        expect(readUiStyle("alice")).toBe("simple");
        expect(readUiStyle("bob")).toBe("notebook");
        expect(readLastUiStyle()).toBe("notebook");
        expect(localStorage.getItem("app-theme")).toBeNull();
    });

    it("存储读取抛错时回退默认值，所有写入抛错时不向外抛出", () => {
        vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("禁止读取"); });
        vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("禁止写入"); });
        expect(readUiStyle("alice")).toBe("notebook");
        expect(readLastUiStyle()).toBe("notebook");
        expect(() => writeUiStyle("alice", "simple")).not.toThrow();
    });
});

const routeCases: [string, boolean][] = [
    ["/admin", true], ["/admin/", true], ["/admin/user/123", true],
    ["/print-preview", true], ["/print-preview/", true],
    ["/exams/123/print", true], ["/exams/123/print/", true],
    ["/", false], ["/settings", false], ["/administrator", false],
    ["/print-preview-other", false], ["/exams/123", false],
    ["/exams/123/printing", false], ["/notebooks/print", false],
];

describe("路由风格与首屏初始化", () => {
    it.each(routeCases)("%s 强制简洁为 %s，首屏与运行时一致", (pathname, forced) => {
        expect(isSimpleUiRoute(pathname)).toBe(forced);
        expect(resolveUiStyle("notebook", pathname)).toBe(forced ? "simple" : "notebook");
        expect(resolveUiStyle("simple", pathname)).toBe("simple");
        window.history.replaceState({}, "", pathname);
        new Function(UI_STYLE_INIT_SCRIPT)();
        expect(document.documentElement.dataset.ui).toBe(forced ? "simple" : "notebook");
    });

    it("首屏采用最近风格，非法值和存储失败回退手账，不执行缓存内容", () => {
        window.history.replaceState({}, "", "/");
        writeUiStyle("alice", "simple");
        new Function(UI_STYLE_INIT_SCRIPT)();
        expect(document.documentElement.dataset.ui).toBe("simple");
        const attack = vi.fn();
        vi.stubGlobal("uiStyleAttack", attack);
        localStorage.setItem(UI_STYLE_LAST_KEY, 'simple";uiStyleAttack();//</script>');
        new Function(UI_STYLE_INIT_SCRIPT)();
        expect(document.documentElement.dataset.ui).toBe("notebook");
        expect(attack).not.toHaveBeenCalled();
        vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("禁止读取"); });
        new Function(UI_STYLE_INIT_SCRIPT)();
        expect(document.documentElement.dataset.ui).toBe("notebook");
        window.history.replaceState({}, "", "/admin");
        new Function(UI_STYLE_INIT_SCRIPT)();
        expect(document.documentElement.dataset.ui).toBe("simple");
        vi.unstubAllGlobals();
    });
});

describe("UiStyleProvider", () => {
    let root: Root;
    let host: HTMLDivElement;
    function Probe() {
        const { preference, style, setPreference } = useUiStyle();
        return <>
            <span data-preference={preference} data-style={style} />
            <button onClick={() => setPreference("simple")}>simple</button>
            <button onClick={() => setPreference("notebook")}>notebook</button>
        </>;
    }
    const render = () => act(async () => root.render(<UiStyleProvider><Probe /></UiStyleProvider>));
    const choose = (index: number) => act(() => host.querySelectorAll("button")[index].click());
    const preference = () => host.querySelector("span")!.dataset.preference;

    beforeEach(() => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        delete document.documentElement.dataset.ui;
        window.history.replaceState({}, "", "/");
        vi.unstubAllGlobals();
    });

    it("读取账号偏好，切换立即生效并写入缓存", async () => {
        writeUiStyle("alice", "simple");
        await render();
        expect(preference()).toBe("simple");
        expect(document.documentElement.dataset.ui).toBe("simple");
        choose(1);
        expect(document.documentElement.dataset.ui).toBe("notebook");
        expect(readUiStyle("alice")).toBe("notebook");
    });

    it("切账号不串值，未存储的新账号默认手账，再切回来恢复选择", async () => {
        writeUiStyle("alice", "simple");
        await render();
        mocks.session.data.user.id = "bob";
        await render();
        expect(preference()).toBe("notebook");
        expect(readLastUiStyle()).toBe("notebook");
        mocks.session.data.user.id = "alice";
        await render();
        expect(preference()).toBe("simple");
    });

    it("会话加载期间沿用首屏缓存，登录确定后读取该账号", async () => {
        writeUiStyle("previous", "simple");
        mocks.session.status = "loading";
        await render();
        expect(document.documentElement.dataset.ui).toBe("simple");
        mocks.pathname = "/exams/paper/print";
        await render();
        expect(document.documentElement.dataset.ui).toBe("simple");
        mocks.session.status = "authenticated";
        mocks.pathname = "/settings";
        await render();
        expect(document.documentElement.dataset.ui).toBe("notebook");
    });

    it.each(["/admin/user/123", "/print-preview", "/exams/123/print"])("进入 %s 临时简洁，离开恢复偏好且缓存不变", async (pathname) => {
        await render();
        mocks.pathname = pathname;
        await render();
        expect(preference()).toBe("notebook");
        expect(document.documentElement.dataset.ui).toBe("simple");
        expect(readLastUiStyle()).toBe("notebook");
        mocks.pathname = "/notebooks";
        await render();
        expect(document.documentElement.dataset.ui).toBe("notebook");
    });

    it("存储不可用仍能切换，且各账号的会话选择互相隔离", async () => {
        vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("禁止读取"); });
        vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("禁止写入"); });
        await render();
        choose(0);
        expect(document.documentElement.dataset.ui).toBe("simple");
        mocks.session.data.user.id = "bob";
        await render();
        expect(document.documentElement.dataset.ui).toBe("notebook");
        mocks.session.data.user.id = "alice";
        await render();
        expect(document.documentElement.dataset.ui).toBe("simple");
    });

    it("其他标签页更新风格时重新读取，不响应明暗缓存事件", async () => {
        await render();
        choose(0);
        localStorage.setItem(getUiStyleStorageKey("alice"), "notebook");
        act(() => window.dispatchEvent(new StorageEvent("storage", { key: "app-theme" })));
        expect(preference()).toBe("simple");
        act(() => window.dispatchEvent(new StorageEvent("storage", { key: "ui-style:alice" })));
        expect(preference()).toBe("notebook");
    });
});
