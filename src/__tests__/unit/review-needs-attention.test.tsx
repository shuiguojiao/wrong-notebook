import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewNeedsAttention } from '@/components/review/review-needs-attention';
import { LanguageProvider, loadEnTranslations } from '@/contexts/LanguageContext';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('需要看一眼入口', () => {
    it.each([0, -1])('数量为 %s 时不渲染', async count => {
        await act(async () => root.render(<LanguageProvider><ReviewNeedsAttention count={count} /></LanguageProvider>));
        expect(container.childElementCount).toBe(0);
    });
    it.each(['zh', 'en'])('以 %s 显示数量并响应点击', async language => {
        localStorage.setItem('app-language', language);
        await loadEnTranslations();
        const onOpen = vi.fn();
        await act(async () => root.render(<LanguageProvider><ReviewNeedsAttention count={3} onOpen={onOpen} /></LanguageProvider>));
        const button = container.querySelector('button')!;
        expect(button.textContent).toBe(language === 'zh' ? '3 道题需要看一眼' : '3 questions need a quick look');
        expect(button.className).toContain('border-amber-');
        expect(button.className).toContain('dark:bg-amber-');
        expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
        await act(async () => button.click());
        expect(onOpen).toHaveBeenCalledTimes(1);
    });
});
