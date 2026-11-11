import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { OutdatedBrowserNotice } from '@/components/outdated-browser-notice';

it('旧安卓内核提示升级且可以关闭', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android; wv) Chrome/103.0 WrongNotebookAndroid/1');
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
        await act(async () => root.render(<LanguageProvider><OutdatedBrowserNotice /></LanguageProvider>));
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('WebView');
        expect(host.textContent).toContain('103');
        await act(async () => host.querySelector('button')!.click());
        expect(host.querySelector('[role="alert"]')).toBeNull();
    } finally {
        await act(async () => root.unmount());
        vi.unstubAllGlobals();
    }
});

it('全局样式包含旧内核的 transform 位移与缩放回退', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toContain('@supports not (translate: 0)');
    expect(css).toMatch(/transform:\s*translate\(var\(--tw-translate-x/);
    expect(css).toContain('scale(var(--tw-scale-x');
});
