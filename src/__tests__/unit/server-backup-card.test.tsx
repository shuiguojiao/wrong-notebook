import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zh } from "@/lib/i18n/zh";
import { emptyStatus } from "@/lib/server-backup/schema";
import type { BackupOverview } from "@/lib/server-backup/schema";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiClient: mocks }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ t: zh }) }));
vi.mock("@/contexts/TimeZoneContext", () => ({ useTimeZone: () => ({ timeZone: "Asia/Shanghai" }) }));
import { ServerBackupCard } from "@/components/admin/server-backup-card";

let container: HTMLDivElement;
let root: Root;
let overview: BackupOverview;
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    overview = { directory: "/data/backups", keep: 7, enabled: true, running: false, stale: true, status: emptyStatus(), snapshots: [] };
    mocks.get.mockImplementation(async () => overview);
    mocks.post.mockResolvedValue({ started: true });
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});
const render = () => act(async () => root.render(<ServerBackupCard />));
describe("管理员备份面板", () => {
    it("显示位置、保留数与48小时警告；手动触发后显示运行中并禁用按钮", async () => {
        await render();
        expect(container.textContent).toContain("/data/backups");
        expect(container.querySelector('[role="alert"]')?.textContent).toContain("48");
        mocks.post.mockImplementation(async () => { overview = { ...overview, running: true }; return { started: true }; });
        await act(async () => container.querySelector("button")?.click());
        expect(mocks.post).toHaveBeenCalledWith("/api/admin/backups", {});
        expect(container.querySelector("button")?.disabled).toBe(true);
        expect(container.textContent).toContain(zh.serverBackup.running);
    });
    it("禁用配置不允许触发；服务端错误码在面板显示", async () => {
        overview.enabled = false;
        overview.status = { ...emptyStatus(), result: "failed", errorCode: "EACCES" };
        await render();
        expect(container.querySelector("button")?.disabled).toBe(true);
        expect(container.textContent).toContain("EACCES");
        expect(container.textContent).toContain(zh.serverBackup.disabled);
    });
});
