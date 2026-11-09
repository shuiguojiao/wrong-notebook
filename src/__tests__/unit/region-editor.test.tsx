import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegionEditor } from "@/components/import-batch/region-editor";
import { LanguageProvider } from "@/contexts/LanguageContext";

let root: Root;
let container: HTMLDivElement;
const region = { x: 0.1, y: 0.2, width: 0.6, height: 0.4 };
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
function button(label: string) { return [...container.querySelectorAll("button")].find(node => node.textContent === label)!; }
async function click(label: string) { await act(async () => button(label).click()); }

describe("整页区域编辑器", () => {
    it("保留初始坐标，增删多个框并将全部坐标交给保存动作", async () => {
        const save = vi.fn();
        await act(async () => root.render(<LanguageProvider><RegionEditor imageUrl="/source.png" regions={[region]} onClose={vi.fn()} onSave={save} saveLabel="保存框选" /></LanguageProvider>));
        await click("保存框选"); expect(save).toHaveBeenLastCalledWith([region]);
        for (let index = 0; index < 3; index++) await click("添加区域");
        expect(container.querySelectorAll('button[aria-pressed]')).toHaveLength(4);
        expect(button("添加区域")).toBeUndefined();
        await click("保存框选"); expect(save.mock.calls.at(-1)?.[0]).toHaveLength(4);
        await click("删除此区域");
        expect(container.querySelectorAll('button[aria-pressed]')).toHaveLength(3);
        await click("保存框选"); expect(save.mock.calls.at(-1)?.[0]).toHaveLength(3);
    });
    it("跨页保留的框占用总数上限，保存中禁用操作并显示服务端错误", async () => {
        const save = vi.fn();
        await act(async () => root.render(<LanguageProvider><RegionEditor imageUrl="/source.png" regions={[region]} maxRegions={1} busy onClose={vi.fn()} onSave={save} errorMessage="版本冲突" /></LanguageProvider>));
        expect(button("添加区域")).toBeUndefined();
        expect([...container.querySelectorAll("button")].every(node => node.disabled)).toBe(true);
        expect(container.querySelector('[role="alert"]')?.textContent).toBe("版本冲突");
        await click("使用此区域"); expect(save).not.toHaveBeenCalled();
    });
});
