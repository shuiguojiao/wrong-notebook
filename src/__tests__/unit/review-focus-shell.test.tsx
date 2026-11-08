import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundTasksButton } from '@/components/background-tasks-button';
import { AppShell } from '@/components/app-shell';
import { LanguageProvider } from '@/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({ pathname: '/review/session', subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/contexts/TimeZoneContext', () => ({ useTimeZone: () => ({ timeZone: 'Asia/Shanghai' }) }));
vi.mock('@/lib/background-task-store', () => ({ backgroundTaskStore: { getSnapshot: () => [], subscribe: mocks.subscribe } }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { name: '学生' } }, status: 'authenticated' }), signOut: vi.fn() }));
vi.mock('@/lib/hooks/use-upload-queue', () => ({ useUploadQueue: () => ({ queue: {} }) }));
vi.mock('@/lib/hooks/use-setup-redirect', () => ({ useSetupRedirect: vi.fn() }));
vi.mock('@/components/import-tasks/import-tasks-indicator', () => ({ ImportTasksIndicator: () => null }));
vi.mock('@/components/settings-dialog', () => ({ SettingsDialog: () => null }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/upload-zone/pending-uploads', () => ({ PendingUploads: () => null }));
beforeEach(() => { mocks.pathname = '/review/session'; mocks.subscribe.mockImplementation(() => mocks.unsubscribe); });
afterEach(() => vi.unstubAllGlobals());

describe('复习专注模式的全局布局', () => {
    it('登录用户在会话页也不渲染应用顶栏和底部导航，正文保持可用', async () => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        const container = document.createElement('div');
        const root = createRoot(container);
        try {
            await act(async () => root.render(<LanguageProvider><AppShell><main>作答内容</main></AppShell><BackgroundTasksButton /></LanguageProvider>));
            expect(container.querySelector('header')).toBeNull();
            expect(container.querySelector('nav')).toBeNull();
            expect(container.querySelector('main')?.textContent).toBe('作答内容');
            expect(container.querySelector('button')).toBeNull();
            expect(mocks.subscribe).not.toHaveBeenCalled();
            mocks.pathname = '/review';
            await act(async () => root.render(<LanguageProvider><AppShell><main>列表内容</main></AppShell><BackgroundTasksButton /></LanguageProvider>));
            expect(container.querySelector('nav')).toBeTruthy();
            expect(container.querySelector('button[aria-label="后台任务"]')).toBeTruthy();
            expect(mocks.subscribe).toHaveBeenCalledTimes(1);
            mocks.pathname = '/review/session';
            await act(async () => root.render(<LanguageProvider><AppShell><main>作答内容</main></AppShell><BackgroundTasksButton /></LanguageProvider>));
            expect(container.querySelector('button')).toBeNull();
            expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
        } finally { await act(async () => root.unmount()); }
    });
});
