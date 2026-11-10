import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentNavigation } from '@/components/student/student-navigation';
import { LanguageProvider } from '@/contexts/LanguageContext';

afterEach(() => vi.unstubAllGlobals());
describe('学生四入口', () => {
    it('两种风格共用侧栏与底栏；保留头像、拍照深链及旧页面我的高亮', async () => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        localStorage.setItem('app-language', 'zh');
        const container = document.createElement('div');
        const root = createRoot(container);
        try {
            for (const style of ['simple', 'notebook']) {
                document.documentElement.dataset.ui = style;
                await act(async () => root.render(<LanguageProvider><StudentNavigation pathname="/stats" userName="alice" /></LanguageProvider>));
                const links = [...container.querySelectorAll('nav > div a')];
                expect(links.map(link => link.textContent)).toEqual(['今天', '错题本', '收集册', '我的']);
                expect(links.map(link => link.getAttribute('href'))).toEqual(['/', '/notebooks', '/collection', '/me']);
                expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('我的');
                expect(container.querySelector('a[title="alice"]')?.textContent).toBe('A');
                expect(container.querySelector('a[href="/?entry=photo#question-entry"]')).not.toBeNull();
                expect(container.querySelectorAll('nav')).toHaveLength(1);
            }
        } finally { delete document.documentElement.dataset.ui; await act(async () => root.unmount()); }
    });
});
