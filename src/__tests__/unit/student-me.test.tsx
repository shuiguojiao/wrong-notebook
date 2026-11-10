import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MePage from '@/app/me/page';
import { LanguageProvider } from '@/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({ role: 'user', order: [] as string[], setUser: vi.fn(), signOut: vi.fn(), clear: vi.fn() }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { name: '同学', role: mocks.role } } }), signOut: mocks.signOut }));
vi.mock('@/lib/hooks/use-upload-queue', () => ({ useUploadQueue: () => ({ queue: { setUser: mocks.setUser } }) }));
vi.mock('@/lib/import/entry-draft-store', () => ({ clearEntryDrafts: mocks.clear }));
vi.mock('@/lib/page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('@/components/settings-dialog', () => ({ SettingsDialog: ({ trigger, initialTab, focusAgent }: { trigger: ReactNode; initialTab?: string; focusAgent?: boolean }) => <div data-tab={initialTab} data-agent={focusAgent}>{trigger}</div> }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => <button>主题</button> }));
vi.mock('@/components/settings/ui-style-setting', () => ({ UiStyleSetting: () => <div>界面风格</div> }));
vi.mock('@/components/tasks/task-panel', () => ({ TaskPanel: ({ open }: { open: boolean }) => open ? <div role="dialog">任务结果</div> : null }));
let root: Root;
let container: HTMLDivElement;
async function render() { await act(async () => root.render(<LanguageProvider><MePage /></LanguageProvider>)); }
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.setItem('app-language', 'zh');
    mocks.role = 'user'; mocks.order = []; vi.clearAllMocks();
    mocks.setUser.mockImplementation(async () => { mocks.order.push('queue'); });
    mocks.clear.mockImplementation(() => { mocks.order.push('draft'); });
    mocks.signOut.mockImplementation(async () => { mocks.order.push('logout'); });
    container = document.createElement('div'); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
describe('我的', () => {
    it('提供学习入口、风格、主题、设置与账户页签 Agent 入口，管理员入口按角色显示', async () => {
        await render();
        expect([...container.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['/history', '/stats', '/exams', '/import-tasks']);
        expect(container.textContent).toContain('界面风格'); expect(container.textContent).toContain('主题');
        expect(container.querySelector('[data-tab="account"][data-agent="true"]')?.textContent).toBe('AI Agent 接入');
        mocks.role = 'admin'; await render();
        expect(container.querySelector('a[href="/admin"]')?.textContent).toBe('管理');
    });
    it('打开任务面板，并在退出前依次清空上传队列与录入草稿', async () => {
        await render();
        const button = (text: string) => [...container.querySelectorAll('button')].find(node => node.textContent === text)!;
        await act(async () => button('后台任务').click());
        expect(container.querySelector('[role="dialog"]')?.textContent).toBe('任务结果');
        await act(async () => button('退出登录').click());
        expect(mocks.setUser).toHaveBeenCalledWith(null);
        expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' });
        expect(mocks.order).toEqual(['queue', 'draft', 'logout']);
    });
});
