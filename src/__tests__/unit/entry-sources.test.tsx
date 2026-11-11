import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntrySources } from "@/components/question-entry/entry-sources";
import { toast } from "@/lib/feedback";
import { zh } from "@/lib/i18n/zh";
import { acceptedExtensions, IMPORT_FILE_TYPES } from "@/lib/import/file-read";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ t: zh }) }));
vi.mock("@/lib/feedback", () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));

let host: HTMLDivElement;
let root: Root;
const callbacks = { onModeChange: vi.fn(), onImageSelect: vi.fn(), onImagesSelect: vi.fn(), onFileSelect: vi.fn() };
async function render(isBusy = false) {
    await act(async () => root.render(<EntrySources mode="text" isBusy={isBusy} {...callbacks} />));
}
async function choose(files: File[], testId = "file-input") {
    const input = host.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)!;
    Object.defineProperty(input, "files", { configurable: true, value: files });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
function paste(file: File, target: HTMLElement = window.document.body) {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { items: [{ kind: "file", type: file.type, getAsFile: () => file }] } });
    target.dispatchEvent(event);
}
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    host = document.createElement("div"); document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("统一录入来源", () => {
    it("触屏四格、桌面两块，打字选中且通用选择器涵盖全部导入扩展名", async () => {
        await render();
        const touch = host.querySelector('[data-testid="entry-touch-sources"]')!;
        expect([...touch.querySelectorAll("button")].map(button => button.textContent)).toEqual(["拍照", "相册", "文件", "打字"]);
        expect(touch.querySelector('[aria-pressed="true"]')?.textContent).toBe("打字");
        const accept = host.querySelector('[data-testid="file-input"]')!.getAttribute("accept")!;
        for (const extension of IMPORT_FILE_TYPES.flatMap(acceptedExtensions)) expect(accept.split(",")).toContain(extension);
        expect(accept).toContain("image/*");
        expect(host.querySelector('[data-testid="camera-input"]')?.getAttribute("capture")).toBe("environment");
        expect(host.querySelector('[data-testid="album-input"]')?.hasAttribute("multiple")).toBe(true);
        expect(host.querySelectorAll('[data-testid="entry-desktop-sources"] button')).toHaveLength(2);
        expect(host.querySelector("a")?.getAttribute("href")).toBe("/me#agent-settings");
    });
    it.each([
        ["paper.pdf", "application/pdf", "file"],
        ["photo.jpg", "image/jpeg", "image"],
        ["photo.jpg", "", "image"],
        ["photo.HEIC", "", "image"],
        ["photo.heif", "application/octet-stream", "image"],
    ])("文件 %s 按类型分流到 %s", async (name, type, mode) => {
        await render();
        const file = new File(["内容"], name, { type });
        await choose([file]);
        expect(callbacks.onModeChange).toHaveBeenCalledWith(mode);
        expect(mode === "file" ? callbacks.onFileSelect : callbacks.onImageSelect).toHaveBeenCalledWith(file);
        expect(mode === "file" ? callbacks.onImageSelect : callbacks.onFileSelect).not.toHaveBeenCalled();
    });
    it("多选相册走现有询问流程，超过 20 张只提示", async () => {
        await render();
        const files = Array.from({ length: 21 }, (_, n) => new File(["x"], `${n}.jpg`, { type: "image/jpeg" }));
        await choose(files.slice(0, 2), "album-input");
        expect(callbacks.onImagesSelect).toHaveBeenCalledWith(files.slice(0, 2));
        callbacks.onImagesSelect.mockClear();
        await choose(files, "album-input");
        expect(toast.warning).toHaveBeenCalledWith(zh.upload.albumLimit);
        expect(callbacks.onImagesSelect).not.toHaveBeenCalled();
    });
    it("拍照点击直接触发 capture input，无摄像头时提示", async () => {
        vi.stubGlobal("navigator", { mediaDevices: { enumerateDevices: async () => [] } });
        await render();
        const click = vi.spyOn(HTMLInputElement.prototype, "click");
        const camera = host.querySelector<HTMLButtonElement>('[data-testid="entry-touch-sources"] button')!;
        await act(async () => camera.click());
        expect(toast.warning).toHaveBeenCalledWith(zh.upload.noCamera);
        expect(click).not.toHaveBeenCalled();
    });
    it("相机能力未知时，用户手势直接点击 capture input", async () => {
        await render();
        const click = vi.spyOn(HTMLInputElement.prototype, "click");
        await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="entry-touch-sources"] button')!.click());
        expect(click.mock.instances[0]).toBe(host.querySelector('[data-testid="camera-input"]'));
    });
    it("切到打字仍可全局粘贴，输入框内的粘贴不拦截，识别中禁用入口", async () => {
        await render();
        const file = new File(["x"], "paste.png", { type: "image/png" });
        await act(async () => paste(file));
        expect(callbacks.onImageSelect).toHaveBeenCalledWith(file);
        callbacks.onImageSelect.mockClear();
        const input = document.createElement("textarea"); host.appendChild(input);
        await act(async () => paste(file, input));
        expect(callbacks.onImageSelect).not.toHaveBeenCalled();
        await render(true);
        expect([...host.querySelectorAll("button")].every(button => button.disabled)).toBe(true);
        await act(async () => paste(file));
        await choose([file]);
        expect(callbacks.onImageSelect).not.toHaveBeenCalled();
    });
    it.each([["paper.pdf", "application/pdf"], ["photo.jpg", "image/jpeg"]])("拖入 %s 使用同一分流", async (name, type) => {
        await render();
        const file = new File(["x"], name, { type });
        const event = new Event("drop", { bubbles: true });
        Object.defineProperty(event, "dataTransfer", { value: { files: [file], items: [{ kind: "file", type, getAsFile: () => file }], types: ["Files"] } });
        await act(async () => host.querySelector('[data-testid="entry-desktop-sources"] > div')!.dispatchEvent(event));
        expect(type === "application/pdf" ? callbacks.onFileSelect : callbacks.onImageSelect).toHaveBeenCalledWith(file);
    });
});
