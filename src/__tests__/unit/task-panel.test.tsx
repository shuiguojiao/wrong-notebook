import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskPanel } from '@/components/tasks/task-panel';
import { LanguageProvider } from '@/contexts/LanguageContext';
import type { BackgroundTask } from '@/lib/background-tasks';

const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), remove: vi.fn(), refresh: vi.fn(), close: vi.fn(), unsubscribe: vi.fn() }));
const tasks: BackgroundTask[] = [{ id: 'task', kind: 'exam', status: 'succeeded', subject: '试卷 A', progress: { done: 3, total: 3, failed: 0 }, error: null, link: '/exams/a', target: null, startedAt: '2026-11-10T00:00:00Z', finishedAt: '2026-11-10T00:01:00Z' }];
vi.mock('@/lib/background-task-store', () => ({ backgroundTaskStore: { getSnapshot: () => tasks, subscribe: mocks.subscribe, refresh: mocks.refresh } }));
vi.mock('@/lib/api-client', () => ({ apiClient: { delete: mocks.remove } }));
vi.mock('@/contexts/TimeZoneContext', () => ({ useTimeZone: () => ({ timeZone: 'Asia/Shanghai' }) }));
afterEach(() => vi.unstubAllGlobals());
describe('后台任务面板', () => {
    it('保留进度、结果链接、清除记录；关闭后取消订阅', async () => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.setItem('app-language', 'zh');
        mocks.subscribe.mockReturnValue(mocks.unsubscribe);
        const container = document.createElement('div'); document.body.appendChild(container);
        const root = createRoot(container);
        try {
            await act(async () => root.render(<LanguageProvider><TaskPanel open onOpenChange={mocks.close} /></LanguageProvider>));
            const dialog = document.querySelector('[role="dialog"]')!;
            expect(dialog.textContent).toContain('试卷 A'); expect(dialog.textContent).toContain('3 / 3');
            const link = dialog.querySelector<HTMLAnchorElement>('a[href="/exams/a"]')!;
            await act(async () => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
            expect(mocks.close).toHaveBeenCalledWith(false);
            const clear = [...dialog.querySelectorAll('button')].find(button => button.textContent === '清除已结束')!;
            await act(async () => clear.click());
            expect(mocks.remove).toHaveBeenCalledWith('/api/tasks'); expect(mocks.refresh).toHaveBeenCalled();
            await act(async () => root.render(<LanguageProvider><TaskPanel open={false} onOpenChange={mocks.close} /></LanguageProvider>));
            expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
        } finally { await act(async () => root.unmount()); container.remove(); }
    });
});
