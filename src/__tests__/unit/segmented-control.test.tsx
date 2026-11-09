import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { Keyboard } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "@/components/ui/segmented-control";

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

describe("分段切换", () => {
    it.each([
        { labels: ["打字", "手写"], size: "compact" as const },
        { labels: ["全部", "待复习", "已掌握"], size: "full" as const },
        { labels: ["解析", "错因", "笔记"], size: "full" as const },
    ])("渲染 $labels 并响应点击，支持 $size 尺寸", async ({ labels, size }) => {
        const onChange = vi.fn();
        await act(async () => root.render(<SegmentedControl size={size} aria-label="切换内容" value={labels[0]}
            onChange={onChange} options={labels.map(label => ({ label, value: label }))} />));
        const list = container.querySelector('[role="tablist"]')!;
        expect(list.getAttribute("aria-label")).toBe("切换内容");
        expect(list.classList.contains("w-fit")).toBe(size === "compact");
        const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        expect([...tabs].map(tab => tab.textContent)).toEqual(labels);
        expect(tabs[0].getAttribute("aria-selected")).toBe("true");
        expect(tabs[0].tabIndex).toBe(0);
        expect(tabs[1].tabIndex).toBe(-1);
        expect(tabs[0].className).toContain("min-h-11");
        expect(tabs[0].className).toContain("focus-visible:ring-2");
        await act(async () => tabs[1].click());
        expect(onChange).toHaveBeenCalledWith(labels[1]);
    });

    it("支持左右循环、Home/End，焦点和选中态同步并关联面板", async () => {
        function Probe() {
            const [value, setValue] = useState("analysis");
            return <><h2 id="switch-label">内容</h2><SegmentedControl value={value} onChange={setValue} aria-labelledby="switch-label" options={[
                { value: "analysis", label: "解析", icon: Keyboard, id: "analysis-tab", panelId: "analysis-panel" },
                { value: "cause", label: "错因" },
                { value: "notes", label: "笔记" },
            ]} /><div role="tabpanel" id="analysis-panel" aria-labelledby="analysis-tab" hidden={value !== "analysis"}>解析内容</div></>;
        }
        await act(async () => root.render(<Probe />));
        const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        expect(tabs[0].getAttribute("aria-controls")).toBe("analysis-panel");
        expect(tabs[0].querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
        expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-labelledby")).toBe("switch-label");
        tabs[0].focus();
        for (const [key, index] of [["ArrowLeft", 2], ["ArrowRight", 0], ["End", 2], ["Home", 0], ["ArrowRight", 1]] as const) {
            await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
            expect(document.activeElement).toBe(tabs[index]);
            expect(tabs[index].getAttribute("aria-selected")).toBe("true");
            expect(tabs[index].tabIndex).toBe(0);
        }
    });

    it("旧调用仍默认满宽，空选项不渲染，无效选中值仍保留键盘入口", async () => {
        await act(async () => root.render(<SegmentedControl value="missing" onChange={vi.fn()} options={[{ value: "one", label: "一" }]} />));
        expect(container.querySelector('[role="tablist"]')?.className).not.toContain("w-fit");
        expect(container.querySelector("button")?.tabIndex).toBe(0);
        await act(async () => root.render(<SegmentedControl value="missing" onChange={vi.fn()} options={[]} />));
        expect(container.innerHTML).toBe("");
    });
});
