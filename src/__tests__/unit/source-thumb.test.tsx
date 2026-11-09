import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourceThumb } from "@/components/question/source-thumb";
import { LanguageProvider } from "@/contexts/LanguageContext";

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

describe("原图缩略图", () => {
    it("宽幅缩略图显示来源，点开题图 Dialog，关闭后焦点回到缩略图", async () => {
        const onOpen = vi.fn();
        await act(async () => root.render(<LanguageProvider><SourceThumb src="/question.png" alt="题目原图" caption="试卷.pdf · 第 7 页" onOpen={onOpen} /></LanguageProvider>));
        const trigger = container.querySelector("button")!;
        expect(trigger.getAttribute("aria-label")).toBe("查看图片 · 题目原图");
        expect(trigger.className).toContain("w-full");
        expect(container.querySelector("figcaption")?.textContent).toBe("试卷.pdf · 第 7 页");
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        await act(async () => trigger.click());
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
        expect(dialog.querySelector("img")?.getAttribute("src")).toBe("/question.png");
        expect(dialog.querySelector("img")?.getAttribute("alt")).toBe("题目原图");
        expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("查看图片");
        expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("试卷.pdf · 第 7 页");
        expect(onOpen).toHaveBeenCalledOnce();
        await act(async () => dialog.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!.click());
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it("方形变体为 56px，没有来源时省略说明，支持 Escape 关闭", async () => {
        await act(async () => root.render(<LanguageProvider><SourceThumb src="/old-question.png" alt="旧题题图" size="square" /></LanguageProvider>));
        const trigger = container.querySelector("button")!;
        expect(trigger.className).toContain("size-14");
        expect(container.querySelector("img")?.className).toContain("object-cover");
        expect(container.querySelector("figcaption")).toBeNull();
        await act(async () => trigger.click());
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
        expect(dialog.getAttribute("aria-describedby")).toBeNull();
        await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
});
