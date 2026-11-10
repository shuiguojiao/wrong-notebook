import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusShellContext } from "@/contexts/FocusShellContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CheckQuestionCard } from "@/components/checks/check-question-card";
import ChecksPage from "@/app/checks/page";
import { ImportCheckSummary } from "@/components/checks/import-check-summary";
import { CheckEntry } from "@/components/checks/check-entry";
import { fromCrop, toCrop } from "@/lib/question/region-crop";
import { visibleCheckIssues } from "@/lib/question/pending-checks";
import type { PendingQuestion } from "@/lib/question/pending-checks";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), back: vi.fn(), push: vi.fn(), confirm: vi.fn(), search: "" }));
vi.mock("@/lib/api-client", () => ({ apiClient: { get: mocks.get, post: mocks.post } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: mocks.back, push: mocks.push }), useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock("@/lib/page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/lib/feedback", () => ({ confirmDialog: mocks.confirm }));
vi.mock("@/components/ui/focus-card", () => ({ FocusCard: ({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) => <section><h2>{title}</h2>{children}{footer}</section> }));
vi.mock("@/components/question/source-thumb", () => ({ SourceThumb: () => <img alt="原图" /> }));
vi.mock("@/components/replace-question-image-button", () => ({ ReplaceQuestionImageButton: ({ label }: { label: string }) => <button>{label}</button> }));
let root: Root;
let container: HTMLDivElement;
const first: PendingQuestion = { id: "first", preview: "kě（ ）求", updatedAt: "2026-11-10T00:00:00.000Z", originalImageUrl: "", hasSource: false,
    issues: [{ index: 0, code: "text_diff", field: "questionText", severity: "major", visibility: "user", source: "ai", suggestion: { textSays: "kě", imageSays: "kěn" } }] };
const next: PendingQuestion = { ...first, id: "second", preview: "如图求面积", issues: [{ index: 0, code: "missing_figure", field: "questionText", severity: "minor", visibility: "user", source: "rules" }] };
beforeEach(() => {
    mocks.search = "";
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    mocks.get.mockResolvedValue({ total: 0, items: [] }); mocks.post.mockResolvedValue({}); mocks.confirm.mockResolvedValue(true);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(node: ReactNode) { await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>)); }
function button(label: string) { return [...container.querySelectorAll("button")].find(element => element.textContent === label)!; }
async function click(label: string) { await act(async () => button(label).click()); }

describe("核对页", () => {
    it("加载默认专注，无卡片错误释放，重试加载及成功后隐藏导航", async () => {
        let releasedPath: string | null = null;
        const setReleasedFocusPath: Dispatch<SetStateAction<string | null>> = value => { releasedPath = typeof value === "function" ? value(releasedPath) : value; };
        let reject!: (error: Error) => void;
        mocks.get.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
        await render(<FocusShellContext.Provider value={{ pathname: "/checks", setReleasedFocusPath }}><ChecksPage /></FocusShellContext.Provider>);
        expect(releasedPath).toBeNull();
        expect(container.textContent).not.toContain(first.preview);
        await act(async () => reject(new Error("离线")));
        expect(releasedPath).toBe("/checks");
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
        let resolve!: (value: { total: number; items: PendingQuestion[] }) => void;
        mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        await click("重试");
        expect(releasedPath).toBeNull();
        await act(async () => resolve({ total: 1, items: [first] }));
        expect(releasedPath).toBeNull();
        expect(container.textContent).toContain(first.preview);
    });
    it("实际页面有卡片时保持专注，保存异常不释放，空队列才释放", async () => {
        let releasedPath: string | null = null;
        const setReleasedFocusPath: Dispatch<SetStateAction<string | null>> = value => { releasedPath = typeof value === "function" ? value(releasedPath) : value; };
        mocks.get.mockResolvedValueOnce({ total: 1, items: [first] }).mockResolvedValue({ total: 0, items: [] });
        mocks.post.mockRejectedValueOnce(new Error("离线"));
        await render(<FocusShellContext.Provider value={{ pathname: "/checks", setReleasedFocusPath }}><ChecksPage /></FocusShellContext.Provider>);
        expect(releasedPath).toBeNull();
        await click("没问题"); expect(releasedPath).toBeNull();
        await click("重试"); expect(releasedPath).toBe("/checks");
        expect(container.textContent).toContain("都处理好了");
    });
    it("空队列说明自动核对并提供固定出口", async () => {
        await render(<ChecksPage />);
        expect(container.textContent).toContain("新导入的题会自动核对");
        expect(button("返回上一页")).toBeDefined();
        expect([...container.querySelectorAll("a")].map(link => [link.textContent, link.getAttribute("href")])).toEqual([
            ["回今天", "/"], ["去错题本", "/notebooks"],
        ]);
    });
    it("队列加载失败时显示错误和出口，重试成功后进入空态", async () => {
        mocks.get.mockRejectedValueOnce(new Error("离线"));
        await render(<ChecksPage />);
        const alert = container.querySelector('[role="alert"]')!;
        expect(alert.querySelector('a[href="/"]')?.textContent).toBe("回今天");
        expect(alert.querySelector('a[href="/notebooks"]')?.textContent).toBe("去错题本");
        expect(container.textContent).not.toContain("都处理好了");
        await click("重试");
        expect(container.querySelector('[role="alert"]')).toBeNull();
        expect(container.textContent).toContain("都处理好了");
    });
    it.each([
        [first, "采用 kěn"], [next, "补原图"],
        [{ ...first, issues: [{ ...first.issues[0], code: "image_mismatch" }] }, "替换原图"],
        [{ ...first, hasSource: true, issues: [{ ...first.issues[0], code: "image_mismatch" }] }, "重新框选"],
    ] satisfies Array<[PendingQuestion, string]>)("按问题类型显示现成动作 %j", async (item, label) => {
        await render(<CheckQuestionCard item={item} position={1} total={2} busy={false} onClose={vi.fn()} onResolve={vi.fn()} onReframe={vi.fn()} onReplaced={vi.fn()} />);
        expect(button(label)).toBeDefined();
        expect(button("没问题")).toBeDefined();
        expect(button("删掉")).toBeDefined();
        if (item === first) expect(container.textContent).toContain("原图kěn系统里kě");
    });
    it("处理完自动下一张，全部完成后可返回", async () => {
        mocks.get.mockResolvedValueOnce({ total: 2, items: [first, next] }).mockResolvedValueOnce({ total: 1, items: [next] }).mockResolvedValueOnce({ total: 0, items: [] });
        await render(<ChecksPage />);
        await click("采用 kěn");
        expect(mocks.post).toHaveBeenCalledWith("/api/checks/first/resolve", { action: "accept", updatedAt: first.updatedAt, issueIndex: 0, durationMs: expect.any(Number) });
        expect(container.querySelector("h2")?.textContent).toBe("需要看一眼 · 2 / 2");
        await click("没问题");
        expect(container.textContent).toContain("都处理好了");
        await click("返回上一页");
        expect(mocks.back.mock.calls.length + mocks.push.mock.calls.length).toBe(1);
    });
    it("从复习链接进入时优先显示指定题，处理后继续原有队列", async () => {
        mocks.search = '?id=second';
        mocks.get.mockResolvedValueOnce({ total: 2, items: [first, next] }).mockResolvedValueOnce({ total: 1, items: [first] });
        await render(<ChecksPage />);
        expect(container.textContent).toContain(next.preview);
        expect(button('补原图')).toBeDefined();
        await click('没问题');
        expect(mocks.post).toHaveBeenCalledWith('/api/checks/second/resolve', { action: 'dismiss', updatedAt: next.updatedAt, issueIndex: 0, durationMs: expect.any(Number) });
        expect(container.textContent).toContain(first.preview);
        expect(container.querySelector('h2')?.textContent).toBe('需要看一眼 · 2 / 2');
    });
    it("指定题已处理或不存在时仍可查看其余待核对题", async () => {
        mocks.search = '?id=gone';
        mocks.get.mockResolvedValue({ total: 1, items: [first] });
        await render(<ChecksPage />);
        expect(container.textContent).toContain(first.preview);
        expect(button('采用 kěn')).toBeDefined();
    });
    it("同一题的多个问题依次处理，进度按题计数", async () => {
        const more = { ...first, issues: [first.issues[0], { ...next.issues[0], index: 1 }] };
        mocks.get.mockResolvedValueOnce({ total: 1, items: [more] }).mockResolvedValueOnce({ total: 1, items: [{ ...more, updatedAt: "2026-11-10T00:00:01.000Z", issues: [more.issues[1]] }] });
        await render(<ChecksPage />); await click("采用 kěn");
        expect(container.querySelector("h2")?.textContent).toBe("需要看一眼 · 1 / 1");
        expect(button("补原图")).toBeDefined();
    });
    it("删题必须确认，取消时不提交", async () => {
        mocks.get.mockResolvedValue({ total: 1, items: [first] }); mocks.confirm.mockResolvedValue(false);
        await render(<ChecksPage />); await click("删掉");
        expect(mocks.confirm).toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
    });
    it("冲突后刷新当前题，精确替换失败时显示原因", async () => {
        mocks.get.mockResolvedValue({ total: 1, items: [first] });
        mocks.post.mockRejectedValueOnce({ data: { message: "CHECK_CONFLICT" } }).mockRejectedValueOnce({ data: { message: "CHECK_TEXT_NOT_FOUND" } });
        await render(<ChecksPage />); await click("采用 kěn");
        expect(container.textContent).toContain("题目已在其他地方修改");
        expect(mocks.get).toHaveBeenCalledTimes(2);
        await click("采用 kěn"); expect(container.textContent).toContain("题干中找不到建议对应的文字");
    });
});
describe("条件入口和导入结果", () => {
    it("零问题时首页入口与导入提示均不渲染", async () => {
        await render(<><CheckEntry /><ImportCheckSummary ids={["first"]} /></>);
        expect(container.textContent).toBe("");
    });
    it("首页入口与结果提示显示数量，点击进入核对页", async () => {
        mocks.get.mockResolvedValue({ total: 1, items: [first] });
        await render(<><CheckEntry /><ImportCheckSummary ids={["first", "second"]} /></>);
        expect(container.textContent).toContain("2 道已入库，其中 1 道需要看一眼");
        expect(container.querySelector("a")?.getAttribute("href")).toBe("/checks");
        await click("1 道题可能和原图不一样 · 看一眼"); expect(mocks.push).toHaveBeenCalledWith("/checks");
    });
    it("后台 AI 结果晚到时通过轮询显示，卸载后停止轮询", async () => {
        vi.useFakeTimers();
        try {
            mocks.get.mockResolvedValueOnce({ total: 0, items: [] }).mockResolvedValue({ total: 1, items: [first] });
            await render(<ImportCheckSummary ids={["first"]} />); expect(container.textContent).toBe("");
            await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
            expect(container.textContent).toContain("1 道已入库，其中 1 道需要看一眼");
            await render(<></>); const count = mocks.get.mock.calls.length;
            await act(async () => { await vi.advanceTimersByTimeAsync(10000); }); expect(mocks.get).toHaveBeenCalledTimes(count);
        } finally { vi.useRealTimers(); }
    });
});
describe("区域坐标与可见问题", () => {
    it("相对坐标与百分比双向换算，保留精度", () => {
        const region = { x: 0.125, y: 0.2, width: 0.625, height: 0.4 };
        expect(toCrop(region)).toEqual({ unit: "%", x: 12.5, y: 20, width: 62.5, height: 40 });
        expect(fromCrop(toCrop(region))).toEqual(region);
        expect(fromCrop({ unit: "%", x: 0, y: 0, width: 0.5, height: 50 })).toBeNull();
        expect(fromCrop({ unit: "%", x: 90, y: 0, width: 20, height: 50 })).toBeNull();
        expect(fromCrop({ unit: "%", x: -1, y: 0, width: 20, height: 50 })).toBeNull();
        expect(fromCrop({ unit: "%", x: NaN, y: 0, width: 20, height: 50 })).toBeNull();
    });
    it("过滤后台、已忽略与已修复问题，保留服务端问题下标", () => {
        const issue = first.issues[0];
        expect(visibleCheckIssues([{ ...issue, visibility: "agent" }, { ...issue, dismissed: true }, { ...issue, resolved: true }, issue])).toEqual([{ ...issue, index: 3 }]);
    });
});
