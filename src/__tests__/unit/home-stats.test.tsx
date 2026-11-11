import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { TimeZoneProvider } from "@/contexts/TimeZoneContext";
import type { StudentProgress, StudentSticker } from "@/lib/student-progress";

const mocks = vi.hoisted(() => ({ get: vi.fn(), progress: vi.fn(), search: "" }));
vi.mock('@/lib/hooks/use-rewards', () => ({ useRewards: () => ({ data: null, loading: false, error: false, reload: vi.fn() }) }));
vi.mock('@/lib/hooks/use-stats-data', () => ({ useStatsData: mocks.progress }));
vi.mock("@/lib/api-client", () => ({ apiClient: { get: mocks.get } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { name: "小林" } } }) }));
vi.mock("@/lib/page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/components/student/today-task-status", () => ({ TodayTaskStatus: () => null }));
vi.mock("@/components/question-entry/import-workspace", () => ({
    ImportWorkspace: ({ notebookId, notebookName, photoEntry }: { notebookId?: string; notebookName?: string; photoEntry?: boolean }) => <div data-testid="workspace" data-notebook={notebookId} data-photo-entry={String(!!photoEntry)}>{notebookName}</div>,
}));

const overview = { items: [{ id: 'a', subjectId: 'math', subjectName: '数学', estimatedSec: 240, nextReviewAt: null }], estimatedMinutes: 4, tomorrowMinutes: 2, todayReviewed: 0, todayDurationSec: 0, dayKey: 'u:2026-11-10' };
let root: Root;
let container: HTMLDivElement;
async function render() {
    await act(async () => root.render(<LanguageProvider><TimeZoneProvider initialTimeZone="Pacific/Honolulu"><Home /></TimeZoneProvider></LanguageProvider>));
}
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    localStorage.setItem("app-language", "zh"); sessionStorage.clear();
    mocks.search = "";
    mocks.progress.mockReturnValue({ data: null, loading: false, error: false, reload: vi.fn() });
    mocks.get.mockReset().mockImplementation(async (url: string) => url === '/api/notebooks' ? [{ id: 'math', name: '数学本' }] : overview);
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("今天首页", () => {
    it("印章在问候右侧，周贴纸排在便签和状态清单之后、录入之前", async () => {
        const sticker: StudentSticker = { key: 'math', name: '方程', subjectId: 'math', subjectName: '数学', subjectKey: 'math', tagSet: 'default', state: 'earned', itemIds: ['a'], total: 1, remaining: 0, earnedDay: '2026-11-10' };
        const data: StudentProgress = { stickers: [sticker], earned: 1, weeklyNew: [sticker], streak: 3, reviewedToday: false, day: '2026-11-10', items: {} };
        mocks.progress.mockReturnValue({ data, loading: false, error: false });
        await render();
        expect(mocks.progress).toHaveBeenCalledWith('/api/student-progress');
        const header = container.querySelector('header')!;
        expect(header.className).toContain('flex');
        expect(header.querySelector('[data-stamp="streak"]')?.getAttribute('aria-label')).toBe('连续 3 天');
        expect(header.querySelector('[title]')?.getAttribute('title')).toBe('今天复习后继续');
        expect(header.querySelector('[data-paper]')).toBeNull();
        const weekly = container.querySelector('section[aria-label="这周新收获"]')!;
        expect(weekly.querySelector('[data-state="earned"]')).not.toBeNull();
        expect(weekly.querySelector('a')?.getAttribute('href')).toBe('/collection');
        expect(weekly.parentElement?.className).toContain('lg:row-start-3');
        const note = container.querySelector('section[aria-label="今天要复习"]')!;
        const questions = container.querySelector('#today-questions')!;
        const entry = container.querySelector('section[aria-label="又错了新题？"]')!;
        expect(note.compareDocumentPosition(weekly) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(questions.compareDocumentPosition(weekly) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(weekly.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(entry.closest('.lg\\:row-start-4')).not.toBeNull();
    });
    it("进度加载隐藏奖励，失败可重试且不阻挡开始复习", async () => {
        mocks.progress.mockReturnValue({ data: null, loading: true, error: false });
        await render();
        expect(container.querySelector('[data-stamp]')).toBeNull();
        expect(container.querySelector('section[aria-label="这周新收获"]')).toBeNull();
        const reload = vi.fn();
        mocks.progress.mockReturnValue({ data: null, loading: false, error: true, reload });
        await render();
        expect(container.querySelector('[role="alert"]')?.textContent).toContain('网络开小差');
        expect(container.querySelector('a[href="/review/session?autostart=1"]')).not.toBeNull();
        expect(container.textContent).not.toContain('连续 0 天');
        await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '重新加载')!.click());
        expect(reload).toHaveBeenCalledOnce();
    });
    it("任务区使用与概览和会话一致的队列估时，录入共用工作区后置常驻", async () => {
        await render();
        expect(mocks.get.mock.calls.map(([url]) => url)).toEqual(['/api/notebooks', '/api/review/due?format=overview']);
        expect(container.querySelector('h1')?.textContent).toBe('小林，今天 4 分钟 搞定');
        expect(container.querySelector('section ul')?.textContent).toContain('数学 · 1 题0/1约 4 分钟');
        expect(container.querySelector('section ul [aria-label="已复习 0 题，应复习 1 题"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="workspace"]')).not.toBeNull();
        expect(container.textContent).not.toMatch(/新贴纸|连续.*天/);
    });
    it("应用时区跨日后显示当地日期", async () => {
        vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T01:00:00Z'));
        await render();
        expect(container.querySelector('time')?.textContent).toContain('11月9日');
    });
    it("加载用骨架，失败可重试，重试期间不显示假零", async () => {
        // 固定在日期中不含数字 0 的一天，避免页头日期干扰“不显示假零”的断言。
        vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-12T04:00:00Z'));
        mocks.get.mockImplementation(() => new Promise(() => {}));
        await render();
        expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
        expect(container.textContent).not.toContain('0');
        await act(async () => root.unmount()); root = createRoot(container);
        mocks.get.mockRejectedValue(new Error('离线')); await render();
        expect(container.querySelector('[role="alert"]')?.textContent).toContain('网络开小差');
        expect(container.textContent).not.toContain('今天没有');
        mocks.get.mockImplementation(async (url: string) => url === '/api/notebooks' ? [] : overview);
        await act(async () => container.querySelector('button')!.click());
        expect(container.querySelector('h1')?.textContent).toContain('4 分钟');
    });
    it("录入直接显示共用工作区，保留目标错题本，重渲染不重建实例", async () => {
        mocks.search = 'notebook=math'; await render();
        const workspace = container.querySelector('[data-testid="workspace"]')!;
        expect(workspace.getAttribute('data-notebook')).toBe('math');
        expect(workspace.textContent).toBe('数学本');
        await render();
        expect(container.querySelector('[data-testid="workspace"]')).toBe(workspace);
        expect(container.querySelector('button[aria-label="更多"]')).toBeNull();
    });
    it("侧栏拍照参数传给共用入口，同页聚焦事件不重建工作区", async () => {
        mocks.search = 'entry=photo'; await render();
        expect(container.querySelector('[data-photo-entry="true"]')).not.toBeNull();
        await act(async () => root.unmount()); root = createRoot(container); mocks.search = ''; await render();
        const workspace = container.querySelector('[data-testid="workspace"]');
        expect(workspace).not.toBeNull();
        await act(async () => window.dispatchEvent(new Event('focus-photo-entry')));
        expect(container.querySelector('[data-testid="workspace"]')).toBe(workspace);
    });
});
