import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayTaskStatus } from '@/components/student/today-task-status';
import { LanguageProvider } from '@/contexts/LanguageContext';
import type { BackgroundTask } from '@/lib/background-tasks';
import type { ImportTaskListResponse, ImportTaskSummary } from '@/lib/import/import-task-types';

const mocks = vi.hoisted(() => ({ data: null as ImportTaskListResponse | null, tasks: [] as BackgroundTask[], error: false, toast: vi.fn(), subscribe: vi.fn(), checks: 0, push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/hooks/use-pending-checks', () => ({ usePendingChecks: () => ({ total: mocks.checks }) }));
vi.mock('@/lib/hooks/use-import-tasks', () => ({ useImportTaskList: () => ({ data: mocks.data, error: mocks.error }) }));
vi.mock('@/lib/background-task-store', () => ({ backgroundTaskStore: { getSnapshot: () => mocks.tasks, subscribe: mocks.subscribe } }));
vi.mock('@/lib/feedback', () => ({ toast: { info: mocks.toast } }));
vi.mock('@/components/tasks/task-panel', () => ({ TaskPanel: ({ open }: { open: boolean }) => open ? <div role="dialog">任务面板</div> : null }));
const task = (id: string, status: ImportTaskSummary['status'], unread = false): ImportTaskSummary => ({
    id, status, unread, mode: 'review', subjectId: null, targetSubjectId: null, excerpt: null, batchId: null, batchItemKey: null,
    error: null, errorItemId: null, errorItemShortId: null, notebookName: null, duplicate: false, hasResult: false,
    attempts: 1, timings: {}, createdAt: '2026-11-10T00:00:00Z', finishedAt: null,
});
let root: Root;
let container: HTMLDivElement;
async function render() { await act(async () => root.render(<LanguageProvider><TodayTaskStatus /></LanguageProvider>)); }
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.setItem('app-language', 'zh');
    mocks.checks = 0; mocks.data = null; mocks.tasks = []; mocks.error = false; vi.clearAllMocks(); mocks.subscribe.mockReturnValue(() => undefined);
    container = document.createElement('div'); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
describe('今天任务状态卡', () => {
    it('无任务隐藏，有错误仍可前往识别任务', async () => {
        await render(); expect(container.textContent).toBe('');
        mocks.error = true; await render();
        expect(container.querySelector('a')?.getAttribute('href')).toBe('/import-tasks');
        expect(container.textContent).toContain('任务状态加载失败');
    });
    it('同时呈现识别数量、失败和未读结果，任务完成只提示一次且不修改未读', async () => {
        mocks.data = { tasks: [task('a', 'analyzing'), task('b', 'failed'), task('c', 'review', true)], activeCount: 1, unreadCount: 1 };
        await render();
        expect(container.textContent).toContain('识别中 1 道');
        expect(container.textContent).toContain('有失败'); expect(container.textContent).toContain('有结果可查看');
        expect(container.querySelector('a')?.getAttribute('href')).toBe('/import-tasks');
        mocks.data = { ...mocks.data, tasks: [task('a', 'saved', true)], activeCount: 0, unreadCount: 1 };
        await render(); await render();
        expect(mocks.toast).toHaveBeenCalledTimes(1); expect(mocks.data.unreadCount).toBe(1);
    });
    it('识别与核对共用一张白纸卡，只有核对也显示', async () => {
        mocks.checks = 2;
        await render();
        expect(container.querySelectorAll('[data-paper]')).toHaveLength(1);
        expect(container.textContent).toContain('2 道题可能和原图不一样 · 看一眼');
        await act(async () => container.querySelector('button')!.click());
        expect(mocks.push).toHaveBeenCalledWith('/checks');
        mocks.data = { tasks: [task('a', 'analyzing')], activeCount: 1, unreadCount: 0 };
        await render();
        expect(container.querySelectorAll('[data-paper]')).toHaveLength(1);
        expect(container.textContent).toContain('识别中 1 道');
    });
    it('批次按题数汇总，分题中不伪造题数', async () => {
        mocks.data = { tasks: [], activeCount: 1, unreadCount: 0, batches: [{ id: 'batch', phase: 'processing', status: 'started', source: 'image', splitter: 'ai', mode: 'review', itemCount: 6, selectedCount: 6,
            counts: { total: 6, active: 4, review: 1, saved: 0, failed: 1, duplicate: 0 }, excerpt: null, error: null, unread: false, attempts: 1, createdAt: '', startedAt: null }] };
        await render(); expect(container.textContent).toContain('识别中 4 道');
        mocks.data = { ...mocks.data, batches: [{ ...mocks.data.batches![0], phase: 'splitting', counts: { total: 0, active: 0, review: 0, saved: 0, failed: 0, duplicate: 0 } }] };
        await render(); expect(container.textContent).toContain('正在分题'); expect(container.textContent).not.toContain('识别中 1 道');
    });
    it('复用共享 store，非识别任务结果可打开面板', async () => {
        mocks.tasks = [{ id: 'background', status: 'succeeded' } as BackgroundTask];
        await render();
        expect(mocks.subscribe).toHaveBeenCalledTimes(1);
        await act(async () => container.querySelector('button')!.click());
        expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    });
});
