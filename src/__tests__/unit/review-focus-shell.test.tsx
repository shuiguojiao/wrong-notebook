import { act, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/app-shell';
import { useReleaseFocusShell } from '@/contexts/FocusShellContext';
import { LanguageProvider } from '@/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({ pathname: '/review/session' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { name: '学生' } }, status: 'authenticated' }) }));
vi.mock('@/lib/hooks/use-setup-redirect', () => ({ useSetupRedirect: vi.fn() }));
vi.mock('@/components/upload-zone/pending-uploads', () => ({ PendingUploads: () => null }));

type PageStatus = '加载中' | '作答内容' | '空队列' | '无内容错误' | '收工小结';
function PageState({ status }: { status: PageStatus }) {
    useReleaseFocusShell(status === '空队列' || status === '无内容错误');
    return <main>{status}</main>;
}
function Shell({ children }: { children: ReactNode }) {
    return <StrictMode><LanguageProvider><AppShell>{children}</AppShell></LanguageProvider></StrictMode>;
}
let root: Root;
let container: HTMLDivElement;
async function render(status?: PageStatus) {
    await act(async () => root.render(<Shell>{status ? <PageState status={status} /> : <main>等待页面挂载</main>}</Shell>));
}
beforeEach(() => {
    mocks.pathname = '/review/session';
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

describe('专注模式与页面状态协作', () => {
    it.each(['/review/session', '/checks'])('%s 首屏及未挂载状态上报组件时默认隐藏导航', async path => {
        mocks.pathname = path;
        const html = renderToString(<Shell><main>加载中</main></Shell>);
        expect(html).not.toContain('<nav');
        expect(html).not.toContain('student-shell');
        await render();
        expect(container.querySelector('nav')).toBeNull();
        await render('加载中');
        expect(container.querySelector('nav')).toBeNull();
    });
    it.each(['/review/session', '/checks'])('%s 仅空队列和无内容错误释放，重试与作答保持专注', async path => {
        mocks.pathname = path;
        for (const status of ['空队列', '无内容错误'] as const) {
            await render(status);
            expect(container.querySelector('nav')).not.toBeNull();
            expect(container.querySelector('header')).toBeNull();
            await render('加载中');
            expect(container.querySelector('nav')).toBeNull();
            await render('作答内容');
            expect(container.querySelector('nav')).toBeNull();
        }
    });
    it('复习收工小结保持专注', async () => {
        await render('作答内容');
        await render('收工小结');
        expect(container.querySelector('nav')).toBeNull();
        expect(container.querySelector('main')?.textContent).toBe('收工小结');
    });
    it.each(['/review/session', '/checks'])('%s 的旧空态仍挂载时，释放状态不沿用到另一专注路径', async path => {
        mocks.pathname = path;
        await render('空队列');
        expect(container.querySelector('nav')).not.toBeNull();
        mocks.pathname = path === '/checks' ? '/review/session' : '/checks';
        await render('空队列');
        expect(container.querySelector('nav')).toBeNull();
        await render();
        await render('空队列');
        expect(container.querySelector('nav')).not.toBeNull();
    });
    it.each(['/review/session', '/checks'])('%s 释放在卸载和路由切换后复位，重新进入默认专注', async path => {
        mocks.pathname = path;
        await render('空队列');
        expect(container.querySelector('nav')).not.toBeNull();
        await render();
        expect(container.querySelector('nav')).toBeNull();
        await render('无内容错误');
        mocks.pathname = path === '/checks' ? '/review/session' : '/checks';
        await render();
        expect(container.querySelector('nav')).toBeNull();
        mocks.pathname = '/review';
        await render();
        expect(container.querySelector('nav')).not.toBeNull();
        mocks.pathname = path;
        await render();
        expect(container.querySelector('nav')).toBeNull();
    });
});
