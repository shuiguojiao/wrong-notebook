import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { Trash2 } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoreMenu } from "@/components/ui/more-menu";
import { LanguageProvider, loadEnTranslations } from "@/contexts/LanguageContext";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe("更多菜单", () => {
    it("按钮有可访问名称与 44px 触控尺寸，键盘打开后选择普通菜单项", async () => {
        const edit = vi.fn();
        await act(async () => root.render(<LanguageProvider><MoreMenu items={[{ label: "编辑", onClick: edit }]} /></LanguageProvider>));
        const trigger = container.querySelector("button")!;
        expect(trigger.getAttribute("aria-label")).toBe("更多");
        expect(trigger.className).toContain("size-11");
        expect(trigger.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
        await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
        const menuItem = document.querySelector<HTMLElement>('[role="menuitem"]')!;
        expect(menuItem.textContent).toBe("编辑");
        await act(async () => menuItem.click());
        expect(edit).toHaveBeenCalledOnce();
        expect(document.querySelector('[role="menu"]')).toBeNull();
    });

    it("危险操作保持红色焦点样式，按需显示分隔线和图标", async () => {
        const remove = vi.fn();
        await act(async () => root.render(<LanguageProvider><MoreMenu items={[
            { label: "编辑", onClick: vi.fn(), separatorBefore: true },
            { label: "删除", onClick: remove, destructive: true, separatorBefore: true, groupLabel: "管理", icon: Trash2 },
        ]} /></LanguageProvider>));
        await act(async () => container.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
        const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
        expect(document.querySelectorAll('[role="separator"]')).toHaveLength(1);
        expect(document.querySelector('[role="menu"]')?.textContent).toBe('编辑管理删除');
        expect(items[0].className).not.toContain("text-destructive");
        expect(items[1].className).toContain("text-destructive");
        expect(items[1].className).toContain("focus:text-destructive");
        expect(items[1].querySelector("svg")).toBeTruthy();
        await act(async () => items[1].click());
        expect(remove).toHaveBeenCalledOnce();
    });

    it("英文环境使用英文可访问名称", async () => {
        await loadEnTranslations();
        localStorage.setItem("app-language", "en");
        await act(async () => root.render(<LanguageProvider><MoreMenu items={[]} /></LanguageProvider>));
        expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("More");
    });
});
