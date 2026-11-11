import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChecksEmptyState } from "@/components/checks/checks-empty-state";
import { FocusShellContext } from "@/contexts/FocusShellContext";
import { LanguageProvider, loadEnTranslations } from "@/contexts/LanguageContext";

const mocks = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.setItem("app-language", "zh");
    vi.spyOn(window.history, "length", "get").mockReturnValue(2);
    vi.spyOn(document, "referrer", "get").mockReturnValue("");
    container = document.createElement("div"); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function render(previousPathname?: string | null) {
    await act(async () => root.render(<LanguageProvider>
        <FocusShellContext.Provider value={{ pathname: "/checks", previousPathname, setReleasedFocusPath: vi.fn() }}>
            <ChecksEmptyState />
        </FocusShellContext.Provider>
    </LanguageProvider>));
}
async function expectExit(label: string, returns: boolean) {
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(buttons[0].textContent?.trim()).toBe(label);
    await act(async () => buttons[0].click());
    if (returns) {
        expect(mocks.back).toHaveBeenCalledOnce(); expect(mocks.push).not.toHaveBeenCalled();
    } else {
        expect(mocks.push).toHaveBeenCalledWith("/"); expect(mocks.back).not.toHaveBeenCalled();
    }
}
describe("核对空态的唯一出口", () => {
    it.each(["/notebooks", "/notebooks/math?filter=unmastered", "/error-items/question"])("站内从 %s 进入可返回", async source => {
        await render(source); await expectExit("返回", true);
    });
    it("整页从同源题目详情进入可返回", async () => {
        vi.spyOn(document, "referrer", "get").mockReturnValue(`${window.location.origin}/error-items/question`);
        await render(); await expectExit("返回", true);
    });
    it.each(["", "https://other.example/notebooks", "not a url", "/", "/review/session", "/notebooks/math/add", "/notebooks-extra", "/error-items"])("整页来源 %s 回今天", async source => {
        vi.spyOn(document, "referrer", "get").mockReturnValue(source);
        await render(); await expectExit("回今天", false);
    });
    it("站内来源优先于旧的文档 referrer", async () => {
        vi.spyOn(document, "referrer", "get").mockReturnValue(`${window.location.origin}/notebooks/math`);
        await render("/"); await expectExit("回今天", false);
    });
    it("同源详情但没有可返回历史时回今天", async () => {
        vi.spyOn(window.history, "length", "get").mockReturnValue(1);
        await render("/error-items/question"); await expectExit("回今天", false);
    });
    it("英文来源返回使用对应翻译", async () => {
        localStorage.setItem("app-language", "en"); await loadEnTranslations();
        await render("/notebooks"); await expectExit("Back", true);
    });
});
