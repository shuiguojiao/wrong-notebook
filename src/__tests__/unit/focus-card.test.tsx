import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusCard } from "@/components/ui/focus-card";
import { LanguageProvider } from "@/contexts/LanguageContext";

let root: Root;
let container: HTMLDivElement;
let measure: () => void;
let height: number;
let position: string;
const disconnect = vi.fn();
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    height = 110;
    position = "fixed";
    vi.spyOn(window, "getComputedStyle").mockImplementation(() => ({ position }) as CSSStyleDeclaration);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height }) as DOMRect);
    vi.stubGlobal("ResizeObserver", class {
        constructor(callback: () => void) { measure = callback; }
        observe = vi.fn();
        disconnect = disconnect;
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});
const reservedHeight = () => container.querySelector<HTMLElement>("section")!.style.getPropertyValue("--review-action-height");

describe("专注卡片外壳", () => {
    it("渲染标题、主体、顶栏与底栏插槽，关闭按钮有可访问名称", async () => {
        const onClose = vi.fn();
        const skip = vi.fn();
        await act(async () => root.render(<LanguageProvider>
            <FocusCard title="数学 · 1 / 17" progress={25} onClose={onClose}
                headerActions={<button onClick={skip}>跳过</button>} footer={<button>提交</button>}>
                <p>题目正文</p>
            </FocusCard>
        </LanguageProvider>));
        expect(container.querySelector("h2")?.textContent).toBe("数学 · 1 / 17");
        expect(container.textContent).toContain("题目正文");
        const progress = container.querySelector('[role="progressbar"]')!;
        expect(progress.getAttribute("aria-valuenow")).toBe("25");
        expect(progress.getAttribute("aria-label")).toBe("完成进度");
        expect(progress.className).toContain("h-1");
        const close = container.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!;
        expect(close.className).toContain("size-11");
        await act(async () => close.click());
        expect(onClose).toHaveBeenCalledOnce();
        await act(async () => container.querySelectorAll("button")[1].click());
        expect(skip).toHaveBeenCalledOnce();
        expect([...container.querySelectorAll("button")].at(-1)?.textContent).toBe("提交");
        const body = container.querySelector("section > div")!;
        for (const name of ["rounded-xl", "bg-card", "border", "shadow-xs", "p-4", "sm:p-6"]) expect(body.className).toContain(name);
    });

    it("动态测量底栏含安全区的高度，宽屏横屏内联后清除留位", async () => {
        await act(async () => root.render(<LanguageProvider>
            <FocusCard title="核对 · 1 / 2" progress={50} onClose={vi.fn()} footer={<button>采用修复</button>}>核对内容</FocusCard>
        </LanguageProvider>));
        expect(reservedHeight()).toBe("110px");
        const bar = container.querySelector("section")!.lastElementChild!;
        expect(bar.className).toContain("env(safe-area-inset-bottom)");
        expect(bar.className).toContain("lg:landscape:static");
        height = 180;
        measure();
        expect(reservedHeight()).toBe("180px");
        position = "static";
        window.dispatchEvent(new Event("resize"));
        expect(reservedHeight()).toBe("0px");
        await act(async () => root.render(<LanguageProvider>
            <FocusCard title="核对 · 1 / 2" progress={50} onClose={vi.fn()}>核对内容</FocusCard>
        </LanguageProvider>));
        expect(reservedHeight()).toBe("");
        expect(disconnect).toHaveBeenCalledOnce();
        expect(container.querySelector("section")?.children).toHaveLength(2);
    });

    it.each([[-1, "0"], [101, "100"], [NaN, "0"]])("将异常进度 %s 限定为 %s", async (value, expected) => {
        await act(async () => root.render(<LanguageProvider>
            <FocusCard title="数学" progress={value} onClose={vi.fn()}>正文</FocusCard>
        </LanguageProvider>));
        expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe(expected);
    });
    it("复习保存中可禁用关闭，并保留调用方的可访问名称", async () => {
        const onClose = vi.fn();
        await act(async () => root.render(<LanguageProvider>
            <FocusCard title="数学" progress={0} onClose={onClose} closeDisabled closeLabel="关闭复习">正文</FocusCard>
        </LanguageProvider>));
        const close = container.querySelector<HTMLButtonElement>('button[aria-label="关闭复习"]')!;
        expect(close.disabled).toBe(true);
        await act(async () => close.click());
        expect(onClose).not.toHaveBeenCalled();
    });

});
