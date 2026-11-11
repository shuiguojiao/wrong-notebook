import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PracticePage from "@/app/practice/page";
import { LanguageProvider, loadEnTranslations } from "@/contexts/LanguageContext";

const mocks = vi.hoisted(() => ({ search: "", error: null as string | null, replace: vi.fn(), session: vi.fn() }));
vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(mocks.search),
    useRouter: () => ({ back: vi.fn(), replace: mocks.replace }),
}));
vi.mock("@/lib/page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/lib/hooks/use-practice-session", () => ({ usePracticeSession: (...args: unknown[]) => { mocks.session(...args); return ({
    question: null, loading: false, grading: false, loadingCached: true, error: mocks.error,
}); } }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.setItem("app-language", "zh");
    mocks.search = "";
    mocks.error = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});
async function render() {
    await act(async () => root.render(<LanguageProvider><PracticePage /></LanguageProvider>));
}
function expectExits() {
    expect(container.querySelector('a[href="/notebooks"]')?.textContent).toBe("去错题本");
    expect(container.querySelector('a[href="/"]')?.textContent).toBe("回今天");
}

describe("类似题页面出口", () => {
    it.each(["", "id="])("直接打开 /practice?%s 时替换跳转到错题本且不挂载练习", async search => {
        mocks.search = search;
        await render();
        expect(mocks.replace).toHaveBeenCalledWith("/notebooks");
        expect(container.textContent).toBe("");
        expect(mocks.session).not.toHaveBeenCalled();
    });
    it("请求失败时保留错误提示与固定出口", async () => {
        mocks.search = "id=question";
        mocks.error = "生成失败";
        await render();
        expect(container.querySelector('[role="alert"]')?.textContent).toContain("生成失败");
        expectExits();
        expect(mocks.replace).not.toHaveBeenCalled();
        expect(mocks.session).toHaveBeenCalledWith("question");
    });
    it("英文无参数页也直接替换跳转", async () => {
        localStorage.setItem("app-language", "en");
        await loadEnTranslations();
        await render();
        expect(mocks.replace).toHaveBeenCalledWith("/notebooks");
        expect(container.textContent).toBe("");
        expect(mocks.session).not.toHaveBeenCalled();
    });
});
