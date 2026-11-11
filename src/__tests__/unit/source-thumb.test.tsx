import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourceThumb } from "@/components/question/source-thumb";
import { sourceRegionStyle, initialSourceTransform } from "@/lib/question/source-view";
import type { SourceView } from "@/lib/question/source-view";
import { apiClient } from "@/lib/api-client";
import { LanguageProvider } from "@/contexts/LanguageContext";

vi.mock("@/lib/api-client", () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
const source: SourceView = {
    page: { id: "page", imageUrl: "/full-page.png", width: 800, height: 1200, fileName: "试卷.pdf", pageNumber: 7, origin: "agent", createdAt: "2026-11-09T01:00:00Z" },
    regions: [
        { x: 0.1, y: 0.2, width: 0.8, height: 0.2, order: 0 },
        { x: 0.2, y: 0.6, width: 0.6, height: 0.1, order: 1 },
    ],
};
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
        expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("原图");
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
    it("按相对坐标绘框，初始变换将第一框居中，整页区域按比例适配", () => {
        expect(sourceRegionStyle(source.regions[0])).toEqual({ left: "10%", top: "20%", width: "80%", height: "20%" });
        const transform = initialSourceTransform(source.page!, source.regions[0], 400, 600);
        expect(transform.scale).toBeCloseTo(0.5625);
        expect(transform.x + 800 * 0.5 * transform.scale).toBeCloseTo(200);
        expect(transform.y + 1200 * 0.3 * transform.scale).toBeCloseTo(300);
        expect(initialSourceTransform(source.page!, { x: 0, y: 0, width: 1, height: 1, order: 0 }, 400, 600).scale).toBeLessThanOrEqual(0.5);
        expect(initialSourceTransform(source.page!, undefined, 400, 600)).toEqual({ scale: 0.5, x: 0, y: 0 });
    });

    it("手机保留题图缩略图，桌面可直接展示整页框选，弹层显示多框序号和出处信息", async () => {
        await act(async () => root.render(<LanguageProvider><SourceThumb src="/crop.png" alt="题图" source={source} previewPage /></LanguageProvider>));
        expect(container.querySelector("img")?.getAttribute("src")).toBe("/full-page.png");
        expect(container.querySelector("figcaption")?.textContent).toBe("试卷.pdf · 第 7 页");
        expect(container.querySelector('.h-\\[180px\\]')).not.toBeNull();
        const highlights = container.querySelectorAll('rect[vector-effect="non-scaling-stroke"]');
        expect(highlights).toHaveLength(2);
        expect(highlights[0].getAttribute('x')).toBe('0.1');
        expect(highlights[1].getAttribute('y')).toBe('0.6');
        expect(highlights[0].getAttribute('fill-opacity')).toBe('0.25');
        expect(container.textContent).toContain('放大看');
        await act(async () => container.querySelector("button")!.click());
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
        expect(dialog.className).toContain("h-dvh");
        expect(dialog.textContent).toContain("出处");
        expect(dialog.textContent).toContain("11月9日 · 代理导入");
        expect([...dialog.querySelectorAll('[data-source-region]')].map(node => node.textContent)).toEqual(["1", "2"]);
        expect(dialog.querySelector('[data-source-region="1"]')?.getAttribute("style")).toContain("top: 60%");
        expect(dialog.querySelectorAll('rect[vector-effect="non-scaling-stroke"]')).toHaveLength(2);
        expect(dialog.querySelector('rect[mask]')?.getAttribute("opacity")).toBe("0.35");
        expect(dialog.textContent).not.toContain("重新框选");
        await act(async () => dialog.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!.click());
        await act(async () => root.render(<LanguageProvider><SourceThumb src="/crop.png" alt="题图" source={source} /></LanguageProvider>));
        expect(container.querySelector("img")?.getAttribute("src")).toBe("/crop.png");
    });

    it.each([
        { fileName: null, pageNumber: null, caption: undefined },
        { fileName: "", pageNumber: 7, caption: undefined },
        { fileName: "   ", pageNumber: 7, caption: "来源：课堂练习" },
        { fileName: "照片.jpg", pageNumber: null, caption: "照片.jpg" },
    ])("出处文件名 $fileName、页码 $pageNumber：不伪造标题并保留可访问查看器", async ({ fileName, pageNumber, caption }) => {
        const current = { ...source, page: { ...source.page!, fileName, pageNumber } };
        const sourceText = fileName?.trim() ? undefined : caption;
        await act(async () => root.render(<LanguageProvider><SourceThumb src="/crop.png" alt="题图" source={current} previewPage caption={sourceText} /></LanguageProvider>));
        expect(container.querySelector("figcaption")?.textContent).toBe(caption);
        await act(async () => container.querySelector("button")!.click());
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
        const title = document.getElementById(dialog.getAttribute("aria-labelledby")!)!;
        expect(title.textContent).toBe(fileName?.trim() ? "出处" : "原图");
        expect(title.classList.contains("sr-only")).toBe(!fileName?.trim());
        const description = document.getElementById(dialog.getAttribute("aria-describedby") ?? "");
        expect(description?.textContent).toBe(fileName?.trim() || undefined);
        expect(dialog.textContent).not.toContain("未命名图片");
        expect(dialog.textContent).toContain("11月9日 · 代理导入");
        expect(dialog.querySelector('button[aria-label="关闭"]')).not.toBeNull();
    });

    it("跨页切换时按当前页文件名显示或隐藏标题，保留 PDF 页码", async () => {
        const pages = [
            { page: source.page!, regions: source.regions },
            { page: { ...source.page!, id: "photo", fileName: null, pageNumber: null }, regions: [] },
        ];
        await act(async () => root.render(<LanguageProvider><SourceThumb src="/crop.png" alt="题图" source={{ ...source, pages }} /></LanguageProvider>));
        await act(async () => container.querySelector("button")!.click());
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
        const select = dialog.querySelector('select')!;
        const selectPage = async (value: string) => act(async () => {
            Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("试卷.pdf · 第 7 页");
        await selectPage("1");
        expect(dialog.getAttribute("aria-describedby")).toBeNull();
        expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("原图");
        await selectPage("0");
        expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("试卷.pdf · 第 7 页");
        expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.className).not.toContain("sr-only");
    });

    it("读取出处为空时回退题图，失败显示重试，重试成功切换整页", async () => {
        vi.mocked(apiClient.get).mockResolvedValueOnce({ page: null, regions: [] });
        await act(async () => root.render(<LanguageProvider><SourceThumb key="old" src="/old.png" alt="旧题" errorItemId="old" /></LanguageProvider>));
        await act(async () => container.querySelector("button")!.click());
        expect(document.querySelector('[role="dialog"] img')?.getAttribute("src")).toBe("/old.png");
        expect(apiClient.get).toHaveBeenCalledWith("/api/error-items/old/source", expect.objectContaining({ signal: expect.any(AbortSignal) }));
        vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("断线"));
        await act(async () => root.render(<LanguageProvider><SourceThumb key="new" src="/crop.png" alt="新题" errorItemId="new" /></LanguageProvider>));
        await act(async () => container.querySelector("button")!.click());
        const alert = document.querySelector('[role="dialog"] [role="alert"]')!;
        expect(alert.textContent).toContain("读取出处失败");
        vi.mocked(apiClient.get).mockResolvedValueOnce(source);
        await act(async () => alert.querySelector<HTMLButtonElement>("button")!.click());
        expect(document.querySelector('[role="dialog"] img')?.getAttribute("src")).toBe("/full-page.png");
    });

    it("跨页出处切换后保留各页框号，缩放按钮、滚轮与键盘移动作用于 CSS transform", async () => {
        vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
        const next = { page: { ...source.page!, id: "next", imageUrl: "/next.png", pageNumber: 8 }, regions: [source.regions[1]] };
        const crossPage = { ...source, pages: [{ page: source.page!, regions: [source.regions[0]] }, next] };
        await act(async () => root.render(<LanguageProvider><SourceThumb src="/crop.png" alt="题图" source={crossPage} /></LanguageProvider>));
        await act(async () => container.querySelector("button")!.click());
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
        const viewport = dialog.querySelector<HTMLElement>('[role="region"]')!;
        const canvas = viewport.firstElementChild as HTMLElement;
        const initial = canvas.style.transform;
        await act(async () => dialog.querySelector<HTMLButtonElement>('button[aria-label="放大"]')!.click());
        expect(canvas.style.transform).not.toBe(initial);
        await act(async () => viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
        expect(canvas.style.transform).toContain("translate(-141.25px");
        Object.defineProperty(viewport, "setPointerCapture", { value: vi.fn() });
        const pointer = async (type: string, pointerId: number, x: number, y: number) => {
            const event = new Event(type, { bubbles: true });
            Object.assign(event, { pointerId, pointerType: "touch", clientX: x, clientY: y, button: 0 });
            await act(async () => viewport.dispatchEvent(event));
        };
        await pointer("pointerdown", 1, 100, 100);
        await pointer("pointermove", 1, 150, 120);
        expect(canvas.style.transform).toContain("translate(-91.25px");
        const beforePinch = canvas.style.transform;
        await pointer("pointerdown", 2, 250, 120);
        await pointer("pointermove", 2, 300, 120);
        expect(canvas.style.transform).not.toBe(beforePinch);
        expect(canvas.style.transform).toContain("scale(1.0546875)");
        await pointer("pointerup", 2, 300, 120);
        await pointer("pointercancel", 1, 150, 120);
        const beforeWheel = canvas.style.transform;
        await act(async () => viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true })));
        expect(canvas.style.transform).not.toBe(beforeWheel);
        const select = dialog.querySelector("select")!;
        await act(async () => { select.value = "1"; select.dispatchEvent(new Event("change", { bubbles: true })); });
        expect(dialog.querySelector("img")?.getAttribute("src")).toBe("/next.png");
        expect(dialog.textContent).toContain("试卷.pdf · 第 8 页");
        expect(dialog.querySelector('[data-source-region="1"]')?.textContent).toBe("2");
    });

    it("共用整页查看器可重新框选，按版本保存并刷新题图", async () => {
        const initial = { ...source, updatedAt: "2026-11-10T00:00:00.000Z" };
        const saved = { ...source, updatedAt: "2026-11-10T00:00:01.000Z" };
        vi.mocked(apiClient.get).mockResolvedValueOnce(initial).mockResolvedValueOnce(saved);
        vi.mocked(apiClient.post).mockResolvedValueOnce({ id: "question", updatedAt: saved.updatedAt });
        await act(async () => root.render(<LanguageProvider><SourceThumb src="/old-crop.png" alt="题图" errorItemId="question" /></LanguageProvider>));
        await act(async () => container.querySelector("button")!.click());
        const findButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === label)!;
        await act(async () => findButton("重新框选").click());
        expect(findButton("保存框选")).toBeDefined();
        expect(document.querySelectorAll('[role="dialog"] button[aria-pressed]')).toHaveLength(2);
        await act(async () => findButton("保存框选").click());
        expect(apiClient.post).toHaveBeenCalledWith("/api/checks/question/resolve", {
            action: "reframe", updatedAt: initial.updatedAt, pageId: "page",
            regions: source.regions.map(({ x, y, width, height }) => ({ x, y, width, height })),
        });
        expect(container.querySelector('img[data-question-crop]')?.getAttribute("src")).toBe(`/api/error-items/question/image?v=${new Date(saved.updatedAt).getTime()}`);
        expect(findButton("保存框选")).toBeUndefined();
    });

    it("照片卡重新框选冲突时刷新出处并保留冲突提示，不覆盖新版本", async () => {
        const initial = { ...source, updatedAt: "2026-11-10T00:00:00.000Z" };
        const fresh = { ...source, updatedAt: "2026-11-10T00:01:00.000Z", regions: [source.regions[1]] };
        vi.mocked(apiClient.get).mockResolvedValueOnce(initial).mockResolvedValueOnce(fresh);
        vi.mocked(apiClient.post).mockRejectedValueOnce({ data: { message: 'CHECK_CONFLICT' } });
        await act(async () => root.render(<LanguageProvider><SourceThumb src="/crop.png" alt="题图" errorItemId="conflict" previewPage /></LanguageProvider>));
        await act(async () => container.querySelector("button")!.click());
        const findButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === label)!;
        await act(async () => findButton("重新框选").click());
        await act(async () => findButton("保存框选").click());
        expect(apiClient.post).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain('题目已在其他地方修改');
        expect(container.querySelectorAll('rect[vector-effect="non-scaling-stroke"]')).toHaveLength(1);
        expect(container.querySelector('rect[vector-effect="non-scaling-stroke"]')?.getAttribute('y')).toBe('0.6');
    });

});
